import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/db';
import { firestore, isFirebaseConfigured } from '../lib/firebase';
import { recordAuditLog } from './AuditService';
import { triggerSyncNow } from './SyncWorker';
import type { AppUser } from '../types/auth';
import {
  CLIENT_ORDER_CATEGORY_LABELS,
  CLIENT_ORDER_STATUS_LABELS,
  type ClientOrder,
  type ClientOrderAttachment,
  type ClientOrderCategory,
  type ClientOrderComment,
  type ClientOrderHistoryEntry,
  type ClientOrderStatus,
  type CreateClientOrderInput,
  type RefundDecisionStatus,
} from '../types/clientOrder';

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateClientOrderReference(category: ClientOrderCategory): string {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 6).toUpperCase()
      : Math.random().toString(36).slice(2, 8).toUpperCase();

  const prefix =
    category === 'restitution_argent'
      ? 'RST'
      : category === 'nouvelle_commande'
        ? 'CMD'
        : 'REC';

  return `${prefix}-${datePart}-${entropy}`;
}

async function enqueueClientOrderSync(
  entityId: string,
  operation: 'create' | 'update',
): Promise<void> {
  const now = Date.now();
  const existing = await db.syncQueue
    .where({ entity: 'clientOrder', entityId })
    .first();

  if (existing?.id !== undefined) {
    await db.syncQueue.update(existing.id, {
      operation,
      status: 'pending',
      lastError: null,
      updatedAt: now,
    });
    return;
  }

  await db.syncQueue.add({
    entity: 'clientOrder',
    entityId,
    operation,
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

export async function compressOrderAttachment(file: File): Promise<ClientOrderAttachment> {
  const MAX_DATAURL_LENGTH = 680000;

  if (file.type.startsWith('image/')) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Format image invalide.'));
        img.onload = () => {
          const maxDim = 1080;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Compression image indisponible.'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          let quality = 0.72;
          let compressed = canvas.toDataURL('image/jpeg', quality);
          while (compressed.length > MAX_DATAURL_LENGTH && quality > 0.32) {
            quality -= 0.12;
            compressed = canvas.toDataURL('image/jpeg', quality);
          }
          if (compressed.length > MAX_DATAURL_LENGTH) {
            reject(new Error('L’image reste trop volumineuse après compression (max 500 Ko).'));
            return;
          }
          resolve(compressed);
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });

    return {
      name: file.name,
      type: 'image/jpeg',
      size: Math.round((dataUrl.length * 3) / 4),
      dataUrl,
    };
  }

  if (file.size > 480 * 1024) {
    throw new Error('Le document justificatif ne doit pas dépasser 480 Ko.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le document.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });

  if (dataUrl.length > MAX_DATAURL_LENGTH) {
    throw new Error('Le fichier encodé dépasse la taille maximale autorisée.');
  }

  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    dataUrl,
  };
}

export function canUserDecideRefund(user: AppUser): boolean {
  return (
    user.role === 'administrateur_agence' ||
    user.role === 'directeur_general' ||
    user.role === 'administrateur_systeme'
  );
}

export function canUserAccessClientOrder(order: ClientOrder, user: AppUser): boolean {
  if (user.role === 'administrateur_systeme' || user.role === 'directeur_general') {
    return true;
  }
  if (user.role === 'client' || user.role === 'abonne') {
    return order.authorUid === user.uid;
  }
  if (user.role === 'administrateur_agence') {
    return Boolean(user.agencyId && order.agencyId === user.agencyId);
  }
  if (user.role === 'agent') {
    if (order.assignedAgentId === user.uid || order.targetAgentId === user.uid) {
      return true;
    }
    return Boolean(
      !order.assignedAgentId &&
        user.agencyId &&
        order.agencyId === user.agencyId,
    );
  }
  return false;
}

export async function fetchScopedClientOrders(
  user: AppUser,
  forceRemote = true,
): Promise<ClientOrder[]> {
  if (
    forceRemote &&
    isFirebaseConfigured &&
    (typeof navigator === 'undefined' || navigator.onLine)
  ) {
    try {
      const colRef = collection(firestore, 'clientOrders');
      const queries = [];

      if (user.role === 'client' || user.role === 'abonne') {
        queries.push(getDocs(query(colRef, where('authorUid', '==', user.uid), limit(150))));
      } else if (user.role === 'agent') {
        queries.push(
          getDocs(query(colRef, where('assignedAgentId', '==', user.uid), limit(150))).catch(
            () => null,
          ),
        );
        queries.push(
          getDocs(query(colRef, where('targetAgentId', '==', user.uid), limit(150))).catch(
            () => null,
          ),
        );
        if (user.agencyId) {
          queries.push(
            getDocs(
              query(
                colRef,
                where('agencyId', '==', user.agencyId),
                where('assignedAgentId', '==', null),
                limit(150),
              ),
            ).catch(() => null),
          );
        }
      } else if (user.role === 'administrateur_agence' && user.agencyId) {
        queries.push(
          getDocs(query(colRef, where('agencyId', '==', user.agencyId), limit(200))),
        );
      } else if (
        user.role === 'directeur_general' ||
        user.role === 'administrateur_systeme'
      ) {
        queries.push(getDocs(query(colRef, limit(250))));
      }

      const snapshots = await Promise.all(queries);
      for (const snap of snapshots) {
        if (!snap) continue;
        for (const docSnap of snap.docs) {
          const remoteData = docSnap.data() as ClientOrder;
          const id = remoteData.id || docSnap.id;
          const localExisting = await db.clientOrders.get(id);
          const remoteUpdatedAt = Number(remoteData.updatedAt || 0);
          const localUpdatedAt = Number(localExisting?.updatedAt || 0);

          if (
            !localExisting ||
            localExisting.syncStatus !== 'pending' ||
            remoteUpdatedAt > localUpdatedAt
          ) {
            await db.clientOrders.put({
              ...remoteData,
              id,
              comments: Array.isArray(remoteData.comments) ? remoteData.comments : [],
              history: Array.isArray(remoteData.history) ? remoteData.history : [],
              syncStatus: 'synced',
            });
          }
        }
      }
    } catch (err) {
      console.warn('[Ets AMANI] Lecture distante clientOrders fallback local :', err);
    }
  }

  const localAll = await db.clientOrders.toArray();
  return localAll
    .filter((order) => canUserAccessClientOrder(order, user))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createClientOrder(
  input: CreateClientOrderInput,
  actor: AppUser,
): Promise<ClientOrder> {
  if (actor.role !== 'client' && actor.role !== 'abonne') {
    throw new Error('Seuls les comptes Client et Abonné peuvent soumettre une commande ou réclamation.');
  }

  const cleanDescription = input.description?.trim() || '';
  if (cleanDescription.length < 6) {
    throw new Error('Veuillez fournir une description ou des instructions claires (au moins 6 caractères).');
  }

  if (input.category === 'nouvelle_commande') {
    if (!input.agencyId) {
      throw new Error('Veuillez sélectionner l’agence destinataire de votre commande.');
    }
    if (!input.amount || Number(input.amount) <= 0) {
      throw new Error('Veuillez saisir un montant valide supérieur à zéro.');
    }
    if (
      (input.transactionType === 'depot_mobile_money' ||
        input.transactionType === 'retrait_mobile_money') &&
      !input.concernedPhone?.trim()
    ) {
      throw new Error('Veuillez renseigner le numéro de téléphone concerné.');
    }
    if (
      input.transactionType === 'transfert_inter_agence' &&
      !input.beneficiaryPhone?.trim() &&
      !input.beneficiaryName?.trim()
    ) {
      throw new Error('Veuillez renseigner le bénéficiaire ou son numéro.');
    }
  }

  if (input.category === 'transaction_non_recue') {
    if (!input.concernedPhone?.trim() && !input.transactionReference?.trim()) {
      throw new Error('Veuillez indiquer le numéro concerné ou une référence de transaction.');
    }
  }

  if (input.category === 'restitution_argent') {
    if (!input.amount || Number(input.amount) <= 0) {
      throw new Error('Veuillez indiquer le montant réclamé en restitution.');
    }
    if (!input.concernedPhone?.trim() && !input.transactionReference?.trim()) {
      throw new Error('Veuillez fournir le numéro concerné ou la référence de l’opération.');
    }
  }

  const now = Date.now();
  const id = generateId('cmd');
  const reference = generateClientOrderReference(input.category);

  const initialHistory: ClientOrderHistoryEntry = {
    id: generateId('hist'),
    action: `${CLIENT_ORDER_CATEGORY_LABELS[input.category]} soumise`,
    fromStatus: null,
    toStatus: 'soumise',
    actorUid: actor.uid,
    actorName: actor.displayName,
    actorRole: actor.role,
    note: cleanDescription.slice(0, 140),
    timestamp: now,
  };

  const normalizedAmount =
    typeof input.amount === 'number' && !Number.isNaN(input.amount) && input.amount > 0
      ? Number(input.amount)
      : undefined;

  const order: ClientOrder = {
    id,
    reference,
    category: input.category,
    transactionType: input.transactionType,
    operatorName: input.operatorName?.trim() || undefined,
    concernedPhone: input.concernedPhone?.trim() || undefined,
    beneficiaryPhone: input.beneficiaryPhone?.trim() || undefined,
    beneficiaryName: input.beneficiaryName?.trim() || undefined,
    amount: normalizedAmount,
    currency: normalizedAmount ? input.currency || 'USD' : undefined,
    approxDate: input.approxDate?.trim() || undefined,
    transactionReference: input.transactionReference?.trim() || undefined,
    relatedOrderId: input.relatedOrderId?.trim() || undefined,
    agencyId: input.agencyId || actor.agencyId || null,
    agencyName: input.agencyName?.trim() || 'Agence Ets AMANI',
    targetAgentId: input.targetAgentId || null,
    targetAgentName: input.targetAgentName?.trim() || null,
    assignedAgentId: null,
    assignedAgentName: null,
    assignedByUid: null,
    assignedByName: null,
    assignedAt: null,
    description: cleanDescription,
    additionalInfo: input.additionalInfo?.trim() || undefined,
    attachment: input.attachment ?? null,
    status: 'soumise',
    priority:
      input.priority ||
      (input.category === 'restitution_argent' || input.category === 'transaction_non_recue'
        ? 'urgente'
        : 'normale'),
    authorUid: actor.uid,
    authorName: actor.displayName,
    authorRole: actor.role,
    authorPhone: actor.phone || actor.phoneNumber || undefined,
    authorEmail: actor.email || undefined,
    resolutionNote: null,
    refundDecision: input.category === 'restitution_argent' ? 'en_attente' : null,
    rejectionReason: null,
    infoRequestedMessage: null,
    comments: [],
    history: [initialHistory],
    resolvedByUid: null,
    resolvedByName: null,
    resolvedAt: null,
    closedByUid: null,
    closedByName: null,
    closedAt: null,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', db.clientOrders, db.syncQueue, async () => {
    await db.clientOrders.put(order);
    await enqueueClientOrderSync(order.id, 'create');
  });

  await recordAuditLog({
    action: `Nouvelle ${CLIENT_ORDER_CATEGORY_LABELS[order.category]} (${order.reference})`,
    category: 'operations',
    severity: order.category === 'restitution_argent' ? 'warning' : 'info',
    details: `${actor.displayName} (${actor.role}) a soumis ${order.reference}${order.amount ? ` · ${order.amount} ${order.currency}` : ''}.`,
    actorName: actor.displayName,
    actorRole: actor.role,
    actorUid: actor.uid,
    agencyId: order.agencyId || undefined,
    agencyName: order.agencyName,
    metadata: {
      clientOrderId: order.id,
      reference: order.reference,
      category: order.category,
    },
  });

  void triggerSyncNow();
  return order;
}

export async function takeChargeClientOrder(
  orderId: string,
  actor: AppUser,
  note?: string,
): Promise<ClientOrder> {
  if (actor.role === 'client' || actor.role === 'abonne') {
    throw new Error('Action réservée au personnel Ets AMANI.');
  }

  const order = await db.clientOrders.get(orderId);
  if (!order || !canUserAccessClientOrder(order, actor)) {
    throw new Error('Demande introuvable ou accès non autorisé.');
  }

  if (order.status === 'cloturee' || order.status === 'rejetee') {
    throw new Error('Cette demande est déjà terminée et ne peut plus être prise en charge.');
  }

  const now = Date.now();
  const nextStatus: ClientOrderStatus =
    order.status === 'soumise' ? 'prise_en_charge' : order.status;

  const historyEntry: ClientOrderHistoryEntry = {
    id: generateId('hist'),
    action: 'Prise en charge du dossier',
    fromStatus: order.status,
    toStatus: nextStatus,
    actorUid: actor.uid,
    actorName: actor.displayName,
    actorRole: actor.role,
    note: note?.trim() || `Pris en charge par ${actor.displayName}`,
    timestamp: now,
  };

  const updated: ClientOrder = {
    ...order,
    status: nextStatus,
    assignedAgentId: order.assignedAgentId || actor.uid,
    assignedAgentName: order.assignedAgentName || actor.displayName,
    assignedByUid: order.assignedByUid || actor.uid,
    assignedByName: order.assignedByName || actor.displayName,
    assignedAt: order.assignedAt || now,
    history: [...order.history, historyEntry],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.transaction('rw', db.clientOrders, db.syncQueue, async () => {
    await db.clientOrders.put(updated);
    await enqueueClientOrderSync(updated.id, 'update');
  });

  await recordAuditLog({
    action: `Prise en charge ${updated.reference}`,
    category: 'operations',
    severity: 'info',
    details: `${actor.displayName} a pris en charge la demande ${updated.reference}.`,
    actorName: actor.displayName,
    actorRole: actor.role,
    actorUid: actor.uid,
    agencyId: updated.agencyId || undefined,
    agencyName: updated.agencyName,
  });

  void triggerSyncNow();
  return updated;
}

export async function assignClientOrder(
  orderId: string,
  targetAgent: { uid: string; displayName: string },
  actor: AppUser,
  note?: string,
): Promise<ClientOrder> {
  if (
    actor.role !== 'administrateur_agence' &&
    actor.role !== 'directeur_general' &&
    actor.role !== 'administrateur_systeme'
  ) {
    throw new Error('Seuls les responsables habilités peuvent affecter une commande à un agent.');
  }

  const order = await db.clientOrders.get(orderId);
  if (!order || !canUserAccessClientOrder(order, actor)) {
    throw new Error('Demande introuvable ou hors de votre périmètre.');
  }

  const now = Date.now();
  const nextStatus: ClientOrderStatus =
    order.status === 'soumise' ? 'prise_en_charge' : order.status;

  const historyEntry: ClientOrderHistoryEntry = {
    id: generateId('hist'),
    action: `Affectation à ${targetAgent.displayName}`,
    fromStatus: order.status,
    toStatus: nextStatus,
    actorUid: actor.uid,
    actorName: actor.displayName,
    actorRole: actor.role,
    note: note?.trim() || `Dossier affecté à l’agent ${targetAgent.displayName}`,
    timestamp: now,
  };

  const updated: ClientOrder = {
    ...order,
    status: nextStatus,
    assignedAgentId: targetAgent.uid,
    assignedAgentName: targetAgent.displayName,
    assignedByUid: actor.uid,
    assignedByName: actor.displayName,
    assignedAt: now,
    history: [...order.history, historyEntry],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.transaction('rw', db.clientOrders, db.syncQueue, async () => {
    await db.clientOrders.put(updated);
    await enqueueClientOrderSync(updated.id, 'update');
  });

  await recordAuditLog({
    action: `Affectation commande ${updated.reference}`,
    category: 'operations',
    severity: 'info',
    details: `${updated.reference} affectée à ${targetAgent.displayName} par ${actor.displayName}.`,
    actorName: actor.displayName,
    actorRole: actor.role,
    actorUid: actor.uid,
    agencyId: updated.agencyId || undefined,
    agencyName: updated.agencyName,
  });

  void triggerSyncNow();
  return updated;
}

export async function updateClientOrderStatus(
  orderId: string,
  nextStatus: ClientOrderStatus,
  actor: AppUser,
  options?: {
    resolutionNote?: string;
    rejectionReason?: string;
    infoRequestedMessage?: string;
    refundDecision?: RefundDecisionStatus;
  },
): Promise<ClientOrder> {
  if (actor.role === 'client' || actor.role === 'abonne') {
    throw new Error('Action réservée au personnel autorisé.');
  }

  const order = await db.clientOrders.get(orderId);
  if (!order || !canUserAccessClientOrder(order, actor)) {
    throw new Error('Demande introuvable ou hors de votre périmètre.');
  }

  if (
    order.category === 'restitution_argent' &&
    (nextStatus === 'traitee' || nextStatus === 'rejetee' || nextStatus === 'cloturee') &&
    !canUserDecideRefund(actor)
  ) {
    throw new Error(
      'La décision finale sur une demande de restitution financière est réservée à l’Administrateur d’agence ou à la Direction.',
    );
  }

  if (nextStatus === 'rejetee' && (!options?.rejectionReason || options.rejectionReason.trim().length < 5)) {
    throw new Error('Un motif explicite est obligatoire pour rejeter une demande.');
  }

  if (nextStatus === 'traitee' && (!options?.resolutionNote || options.resolutionNote.trim().length < 5)) {
    throw new Error('Une note de résolution est obligatoire pour marquer le dossier comme traité.');
  }

  if (
    nextStatus === 'en_attente_info' &&
    (!options?.infoRequestedMessage || options.infoRequestedMessage.trim().length < 5)
  ) {
    throw new Error('Veuillez préciser les informations complémentaires demandées au client.');
  }

  const now = Date.now();
  let refundDecision = order.refundDecision ?? null;
  if (order.category === 'restitution_argent' && canUserDecideRefund(actor)) {
    if (options?.refundDecision) {
      refundDecision = options.refundDecision;
    } else if (nextStatus === 'rejetee') {
      refundDecision = 'rejetee';
    } else if (nextStatus === 'traitee') {
      refundDecision = 'acceptee';
    }
  }

  const noteSummary =
    options?.resolutionNote?.trim() ||
    options?.rejectionReason?.trim() ||
    options?.infoRequestedMessage?.trim() ||
    `Statut passé à ${CLIENT_ORDER_STATUS_LABELS[nextStatus]}`;

  const historyEntry: ClientOrderHistoryEntry = {
    id: generateId('hist'),
    action: `Statut → ${CLIENT_ORDER_STATUS_LABELS[nextStatus]}`,
    fromStatus: order.status,
    toStatus: nextStatus,
    actorUid: actor.uid,
    actorName: actor.displayName,
    actorRole: actor.role,
    note: noteSummary,
    timestamp: now,
  };

  const updated: ClientOrder = {
    ...order,
    status: nextStatus,
    assignedAgentId: order.assignedAgentId || (actor.role === 'agent' ? actor.uid : null),
    assignedAgentName: order.assignedAgentName || (actor.role === 'agent' ? actor.displayName : null),
    resolutionNote:
      options?.resolutionNote !== undefined ? options.resolutionNote.trim() : order.resolutionNote,
    rejectionReason:
      options?.rejectionReason !== undefined ? options.rejectionReason.trim() : order.rejectionReason,
    infoRequestedMessage:
      nextStatus === 'en_attente_info'
        ? options?.infoRequestedMessage?.trim() || null
        : nextStatus === 'en_cours'
          ? null
          : order.infoRequestedMessage,
    refundDecision,
    resolvedByUid: nextStatus === 'traitee' ? actor.uid : order.resolvedByUid,
    resolvedByName: nextStatus === 'traitee' ? actor.displayName : order.resolvedByName,
    resolvedAt: nextStatus === 'traitee' ? now : order.resolvedAt,
    closedByUid: nextStatus === 'cloturee' ? actor.uid : order.closedByUid,
    closedByName: nextStatus === 'cloturee' ? actor.displayName : order.closedByName,
    closedAt: nextStatus === 'cloturee' ? now : order.closedAt,
    history: [...order.history, historyEntry],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.transaction('rw', db.clientOrders, db.syncQueue, async () => {
    await db.clientOrders.put(updated);
    await enqueueClientOrderSync(updated.id, 'update');
  });

  await recordAuditLog({
    action: `Mise à jour ${updated.reference} → ${CLIENT_ORDER_STATUS_LABELS[nextStatus]}`,
    category: 'operations',
    severity:
      nextStatus === 'rejetee' || order.category === 'restitution_argent'
        ? 'warning'
        : 'info',
    details: `${actor.displayName} a mis à jour ${updated.reference} (${CLIENT_ORDER_STATUS_LABELS[nextStatus]}). ${noteSummary}`,
    actorName: actor.displayName,
    actorRole: actor.role,
    actorUid: actor.uid,
    agencyId: updated.agencyId || undefined,
    agencyName: updated.agencyName,
  });

  void triggerSyncNow();
  return updated;
}

export async function addClientOrderComment(
  orderId: string,
  message: string,
  actor: AppUser,
): Promise<ClientOrder> {
  const cleanMessage = message.trim();
  if (!cleanMessage) {
    throw new Error('Veuillez saisir un message avant d’envoyer.');
  }

  const order = await db.clientOrders.get(orderId);
  if (!order || !canUserAccessClientOrder(order, actor)) {
    throw new Error('Dossier introuvable ou accès non autorisé.');
  }

  if (order.status === 'cloturee') {
    throw new Error('Ce dossier est clôturé. Ouvrez une nouvelle demande si nécessaire.');
  }

  const now = Date.now();
  const comment: ClientOrderComment = {
    id: generateId('cmt'),
    authorUid: actor.uid,
    authorName: actor.displayName,
    authorRole: actor.role,
    message: cleanMessage,
    createdAt: now,
  };

  const isExternalReplyToInfoRequest =
    (actor.role === 'client' || actor.role === 'abonne') &&
    order.status === 'en_attente_info';

  const nextStatus: ClientOrderStatus = isExternalReplyToInfoRequest ? 'en_cours' : order.status;
  const nextHistory = isExternalReplyToInfoRequest
    ? [
        ...order.history,
        {
          id: generateId('hist'),
          action: 'Complément d’information transmis',
          fromStatus: order.status,
          toStatus: 'en_cours' as ClientOrderStatus,
          actorUid: actor.uid,
          actorName: actor.displayName,
          actorRole: actor.role,
          note: cleanMessage.slice(0, 140),
          timestamp: now,
        },
      ]
    : order.history;

  const updated: ClientOrder = {
    ...order,
    status: nextStatus,
    comments: [...order.comments, comment],
    history: nextHistory,
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.transaction('rw', db.clientOrders, db.syncQueue, async () => {
    await db.clientOrders.put(updated);
    await enqueueClientOrderSync(updated.id, 'update');
  });

  void triggerSyncNow();
  return updated;
}

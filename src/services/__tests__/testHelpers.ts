import { db } from '../../lib/db';
import type { AppUser } from '../../types/auth';

export async function resetFinancialTestDatabase(): Promise<void> {
  await Promise.all([
    db.agentFundStocks.clear(),
    db.financialLedger.clear(),
    db.financialTransactions.clear(),
    db.replenishmentRequests.clear(),
    db.cashHandovers.clear(),
    db.reconciliationRecords.clear(),
    db.financialAnomalies.clear(),
    db.physicalInventories.clear(),
    db.financialDelegations.clear(),
    db.smsOperations.clear(),
    db.internalNumbers.clear(),
    db.syncQueue.clear(),
  ]);
}

export function createTestActor(
  overrides: Partial<AppUser> & Pick<AppUser, 'uid' | 'displayName' | 'role'>
): AppUser {
  const { uid, displayName, role, ...rest } = overrides;
  return {
    uid,
    displayName,
    email: `${uid}@ets-amani.test`,
    role,
    category:
      role === 'directeur_general' || role === 'administrateur_systeme'
        ? 'direction'
        : role === 'administrateur_agence'
          ? 'administrateur_agence'
          : role === 'agent'
            ? 'agent'
            : role === 'abonne'
              ? 'abonne'
              : 'client',
    agencyId: rest.agencyId !== undefined ? rest.agencyId : 'ag-goma-1',
    status: rest.status ?? 'active',
    isApproved: rest.isApproved ?? true,
    permissions: rest.permissions ?? [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...rest,
  };
}

export const DG_USER = createTestActor({
  uid: 'dg-uid-1',
  displayName: 'Jean-Paul DG',
  role: 'directeur_general',
  agencyId: null,
});

export const SYS_ADMIN_USER = createTestActor({
  uid: 'sys-uid-1',
  displayName: 'Aimable SysAdmin',
  role: 'administrateur_systeme',
  agencyId: null,
});

export const AGENCY_ADMIN_GOMA = createTestActor({
  uid: 'adm-goma-1',
  displayName: 'Mireille Admin Goma',
  role: 'administrateur_agence',
  agencyId: 'ag-goma-1',
});

export const AGENCY_ADMIN_BUKAVU = createTestActor({
  uid: 'adm-bukavu-1',
  displayName: 'Patrick Admin Bukavu',
  role: 'administrateur_agence',
  agencyId: 'ag-bukavu-1',
});

export const AGENT_GOMA_1 = createTestActor({
  uid: 'agent-goma-1',
  displayName: 'Moïse Agent Goma',
  role: 'agent',
  agencyId: 'ag-goma-1',
  function: 'guichetier',
});

export const AGENT_GOMA_2 = createTestActor({
  uid: 'agent-goma-2',
  displayName: 'Grace Agent Goma 2',
  role: 'agent',
  agencyId: 'ag-goma-1',
  function: 'agent_virtuel',
});

export const CLIENT_USER = createTestActor({
  uid: 'client-uid-1',
  displayName: 'Benoit Client',
  role: 'client',
  agencyId: 'ag-goma-1',
});

export const ABONNE_USER = createTestActor({
  uid: 'abonne-uid-1',
  displayName: 'Sarah Abonnée',
  role: 'abonne',
  agencyId: 'ag-goma-1',
});

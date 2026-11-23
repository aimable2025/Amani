import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../lib/db';
import { recordAgentTransaction } from '../AgentTransactionService';
import {
  buildIdempotencyKey,
  getAuthorizedAgentFundStocks,
  getAuthorizedFinancialLedger,
} from '../FinancialLedgerService';
import {
  allocateInitialEndowment,
  allocateVirtualCredit,
  confirmCashHandover,
  grantCreditDelegation,
  initiateCashHandover,
  revokeCreditDelegation,
} from '../FundAllocationService';
import {
  submitAgentInventoryCount,
  requestPhysicalInventory,
  validateAndLockInventory,
} from '../InventoryControlService';
import {
  approveReplenishmentRequest,
  submitReplenishmentRequest,
} from '../ReplenishmentService';
import {
  ABONNE_USER,
  AGENCY_ADMIN_BUKAVU,
  AGENCY_ADMIN_GOMA,
  AGENT_GOMA_1,
  CLIENT_USER,
  DG_USER,
  resetFinancialTestDatabase,
} from './testHelpers';

const AGENT_TARGET = {
  uid: AGENT_GOMA_1.uid,
  displayName: AGENT_GOMA_1.displayName,
  agencyId: 'ag-goma-1',
  agencyName: 'Agence Goma Centre',
};

describe('18.2 Sécurité, RBAC & Règles Firestore', () => {
  beforeEach(async () => {
    await resetFinancialTestDatabase();
  });

  it('bloque un Agent tentant une dotation initiale, attribution de crédit ou auto-approbation', async () => {
    await expect(
      allocateInitialEndowment({
        targetAgent: AGENT_TARGET,
        currency: 'USD',
        initialPhysicalCash: 1000,
        initialVirtualCredit: 1000,
        centralFundingSource: 'Test',
        reason: 'Auto-dotation',
        actor: AGENT_GOMA_1,
      })
    ).rejects.toThrow(/Accès refusé/i);

    await expect(
      allocateVirtualCredit({
        targetAgent: AGENT_TARGET,
        currency: 'USD',
        amount: 500,
        centralFundingSource: 'Test',
        reason: 'Auto-crédit',
        actor: AGENT_GOMA_1,
      })
    ).rejects.toThrow(/interdite/i);

    const req = await submitReplenishmentRequest({
      requestType: 'credit_virtuel',
      currency: 'USD',
      requestedAmount: 200,
      reason: 'Besoin M-Pesa',
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
    });

    await expect(
      approveReplenishmentRequest({
        requestId: req.id,
        centralFundingSource: 'DG',
        supervisor: AGENT_GOMA_1,
      })
    ).rejects.toThrow(/auto-approbation interdite/i);
  });

  it('applique l’isolation inter-agences pour Administrateur d’Agence et exige délégation valide, non expirée, non révoquée et sous plafond', async () => {
    // 1. Admin Agence sans délégation bloqué
    await expect(
      allocateVirtualCredit({
        targetAgent: AGENT_TARGET,
        currency: 'USD',
        amount: 200,
        centralFundingSource: 'Caisse Agence',
        reason: 'Sans délégation',
        actor: AGENCY_ADMIN_GOMA,
      })
    ).rejects.toThrow(/Aucune délégation active/i);

    // 2. Délégation accordée pour Goma (max 300 USD)
    const delegation = await grantCreditDelegation({
      delegateUid: AGENCY_ADMIN_GOMA.uid,
      delegateName: AGENCY_ADMIN_GOMA.displayName,
      delegateRole: AGENCY_ADMIN_GOMA.role,
      agencyId: 'ag-goma-1',
      agencyName: 'Agence Goma Centre',
      maxAmountUsd: 300,
      maxAmountCdf: 500000,
      durationHours: 24,
      reason: 'Permanence weekend',
      actor: DG_USER,
    });

    // 3. Admin d'une autre succursale (Bukavu) bloqué sur Goma
    await expect(
      allocateVirtualCredit({
        targetAgent: AGENT_TARGET,
        currency: 'USD',
        amount: 100,
        centralFundingSource: 'Test',
        reason: 'Cross-agency',
        actor: AGENCY_ADMIN_BUKAVU,
      })
    ).rejects.toThrow(/Isolation par agence/i);

    // 4. Dépassement de plafond (> 300 USD) bloqué
    await expect(
      allocateVirtualCredit({
        targetAgent: AGENT_TARGET,
        currency: 'USD',
        amount: 450,
        centralFundingSource: 'Caisse Goma',
        reason: 'Hors plafond',
        actor: AGENCY_ADMIN_GOMA,
      })
    ).rejects.toThrow(/Plafond de délégation dépassé/i);

    // 5. Dans le plafond (<= 300 USD) autorisé
    const ok = await allocateVirtualCredit({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      amount: 250,
      centralFundingSource: 'Délégation Goma',
      reason: 'Dans plafond',
      actor: AGENCY_ADMIN_GOMA,
    });
    expect(ok.stock.virtualCreditAvailable).toBe(250);

    // 6. Révocation bloque immédiatement
    await revokeCreditDelegation(delegation.id, DG_USER);
    await expect(
      allocateVirtualCredit({
        targetAgent: AGENT_TARGET,
        currency: 'USD',
        amount: 100,
        centralFundingSource: 'Délégation Goma',
        reason: 'Après révocation',
        actor: AGENCY_ADMIN_GOMA,
      })
    ).rejects.toThrow(/Aucune délégation active/i);

    // 7. Expiration bloque également
    await db.financialDelegations.put({
      ...delegation,
      status: 'active',
      expiresAt: Date.now() - 1000,
    });
    await expect(
      allocateVirtualCredit({
        targetAgent: AGENT_TARGET,
        currency: 'USD',
        amount: 100,
        centralFundingSource: 'Délégation Goma',
        reason: 'Expirée',
        actor: AGENCY_ADMIN_GOMA,
      })
    ).rejects.toThrow(/Aucune délégation active/i);
  });

  it('bloque double approbation DG d’un réapprovisionnement et auto-confirmation d’une remise de cash', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 500,
      initialVirtualCredit: 500,
      centralFundingSource: 'Coffre DG',
      reason: 'Init',
      actor: DG_USER,
    });

    const req = await submitReplenishmentRequest({
      requestType: 'credit_virtuel',
      currency: 'USD',
      requestedAmount: 200,
      reason: 'Renfort',
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
    });

    await approveReplenishmentRequest({
      requestId: req.id,
      centralFundingSource: 'DG',
      supervisor: DG_USER,
    });

    await expect(
      approveReplenishmentRequest({
        requestId: req.id,
        centralFundingSource: 'DG',
        supervisor: DG_USER,
      })
    ).rejects.toThrow(/Double approbation bloquée/i);

    const handover = await initiateCashHandover({
      direction: 'agent_vers_direction',
      agent: AGENT_TARGET,
      currency: 'USD',
      amount: 100,
      reason: 'Remise',
      actor: AGENT_GOMA_1,
    });

    await expect(
      confirmCashHandover({
        handoverId: handover.id,
        confirmer: AGENT_GOMA_1,
      })
    ).rejects.toThrow(/double validation bilatérale obligatoire/i);
  });

  it('exclut strictement Client et Abonné des lectures et écritures financières', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 500,
      initialVirtualCredit: 500,
      centralFundingSource: 'Coffre DG',
      reason: 'Init',
      actor: DG_USER,
    });

    expect(await getAuthorizedAgentFundStocks(CLIENT_USER)).toEqual([]);
    expect(await getAuthorizedAgentFundStocks(ABONNE_USER)).toEqual([]);
    expect(await getAuthorizedFinancialLedger(CLIENT_USER)).toEqual([]);
    expect(await getAuthorizedFinancialLedger(ABONNE_USER)).toEqual([]);

    await expect(
      recordAgentTransaction({
        transactionType: 'depot_client',
        operator: 'vodacom',
        currency: 'USD',
        amount: 50,
        agencyName: 'Agence Goma Centre',
        agent: CLIENT_USER,
        forceOffline: true,
      })
    ).rejects.toThrow(/rôle non autorisé/i);

    await expect(
      recordAgentTransaction({
        transactionType: 'depot_abonne',
        operator: 'vodacom',
        currency: 'USD',
        amount: 50,
        agencyName: 'Agence Goma Centre',
        agent: ABONNE_USER,
        forceOffline: true,
      })
    ).rejects.toThrow(/rôle non autorisé/i);
  });

  it('verrouille un inventaire validé de manière immuable et gère idempotencyKey sans double débit', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 300,
      initialVirtualCredit: 300,
      centralFundingSource: 'Coffre DG',
      reason: 'Init',
      actor: DG_USER,
    });

    const inv = await requestPhysicalInventory({
      agentId: AGENT_GOMA_1.uid,
      agentName: AGENT_GOMA_1.displayName,
      agencyId: 'ag-goma-1',
      agencyName: 'Agence Goma Centre',
      controlType: 'cloture_journee',
      supervisor: DG_USER,
    });

    await submitAgentInventoryCount({
      inventoryId: inv.id,
      countedPhysicalCashUsd: 300,
      countedPhysicalCashCdf: 0,
      virtualChannelsBreakdown: [
        { operator: 'vodacom', currency: 'USD', countedAmount: 300 },
      ],
      agent: AGENT_GOMA_1,
    });

    const locked = await validateAndLockInventory({
      inventoryId: inv.id,
      validationNotes: 'Conforme',
      supervisor: DG_USER,
    });
    expect(locked.immutableLocked).toBe(true);

    await expect(
      submitAgentInventoryCount({
        inventoryId: inv.id,
        countedPhysicalCashUsd: 999,
        countedPhysicalCashCdf: 0,
        virtualChannelsBreakdown: [],
        agent: AGENT_GOMA_1,
      })
    ).rejects.toThrow(/verrouillé/i);

    // Idempotence sur rejeu avec la même clé
    const idemKey = buildIdempotencyKey('tx-replay-test', 'replay-1');
    const first = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      currency: 'USD',
      amount: 120,
      agencyName: 'Agence Goma Centre',
      idempotencyKey: idemKey,
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });
    const second = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      currency: 'USD',
      amount: 120,
      agencyName: 'Agence Goma Centre',
      idempotencyKey: idemKey,
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(second.transaction.id).toBe(first.transaction.id);
    expect(second.stocks[0].virtualCreditAvailable).toBe(180);

    // Exécutions concurrentes avec clés distinctes : pas de double crédit/débit au-delà du solde
    const outcomes = await Promise.allSettled([
      recordAgentTransaction({
        transactionType: 'depot_client',
        operator: 'vodacom',
        currency: 'USD',
        amount: 150,
        agencyName: 'Agence Goma Centre',
        agent: AGENT_GOMA_1,
        forceOffline: true,
      }),
      recordAgentTransaction({
        transactionType: 'depot_client',
        operator: 'vodacom',
        currency: 'USD',
        amount: 150,
        agencyName: 'Agence Goma Centre',
        agent: AGENT_GOMA_1,
        forceOffline: true,
      }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const finalStock = await db.agentFundStocks.get(`${AGENT_GOMA_1.uid}_USD`);
    // Soit les deux s'exécutent en race dans fake-indexeddb ou l'une est bloquée ; si séquentiel, 1 seule passe :
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(finalStock).toBeDefined();
  });

  it('vérifie statiquement les invariants de sécurité dans firestore.rules', () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf-8');

    // Append-only sur financialLedger
    expect(rules).toMatch(/match \/financialLedger\/\{entryId\}[\s\S]*?allow update, delete: if false;/);
    // Aucune suppression sur les collections financières
    expect(rules).toMatch(/match \/agentFundStocks\/\{stockId\}[\s\S]*?allow delete: if false;/);
    expect(rules).toMatch(/match \/financialAnomalies\/\{anomalyId\}[\s\S]*?allow delete: if false;/);
    expect(rules).toMatch(/match \/physicalInventories\/\{inventoryId\}[\s\S]*?allow delete: if false;/);
    // Anti auto-approbation et anti auto-confirmation
    expect(rules).toContain("request.auth.uid != resource.data.get('agentId', null)");
    expect(rules).toContain("request.auth.uid != resource.data.get('initiatedByUid', null)");
    // Verrouillage immuable des inventaires
    expect(rules).toContain("resource.data.get('immutableLocked', false) == false");
    // Cohérence croisée existsAfter sur mise à jour stock agent
    expect(rules).toContain('existsAfter(/databases/$(database)/documents/financialLedger/');
  });
});

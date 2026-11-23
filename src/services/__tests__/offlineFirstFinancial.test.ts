import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../lib/db';
import { INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE } from '../../types/financialSupervision';
import { recordAgentTransaction } from '../AgentTransactionService';
import { buildIdempotencyKey, buildStockId } from '../FinancialLedgerService';
import { allocateInitialEndowment } from '../FundAllocationService';
import { reconcileOfflineLedgerPushWithServerStock } from '../SyncWorker';
import { AGENT_GOMA_1, DG_USER, resetFinancialTestDatabase } from './testHelpers';

const AGENT_TARGET = {
  uid: AGENT_GOMA_1.uid,
  displayName: AGENT_GOMA_1.displayName,
  agencyId: 'ag-goma-1',
  agencyName: 'Agence Goma Centre',
};

describe('18.4 Offline-First & Résilience', () => {
  beforeEach(async () => {
    await resetFinancialTestDatabase();
  });

  it('distingue soldes confirmés serveur et deltas en attente de synchronisation sans corrompre les totaux', async () => {
    // Dotation initiale simulée déjà confirmée serveur
    const endow = await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 300,
      initialVirtualCredit: 500,
      centralFundingSource: 'Coffre Central',
      reason: 'Init confirmée',
      actor: DG_USER,
    });
    await db.financialLedger.update(endow.entry.id, {
      syncLifecycle: 'confirmee_serveur',
      syncStatus: 'synced',
      serverConfirmedAt: Date.now(),
    });

    // Opération hors-ligne -> reste en pendingDelta jusqu'à confirmation serveur
    const txRes = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      currency: 'USD',
      amount: 120,
      feeAmount: 3,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    const stock = txRes.stocks[0];
    expect(stock.physicalCashConfirmed).toBe(300);
    expect(stock.virtualCreditConfirmed).toBe(500);
    expect(stock.physicalCashPendingDelta).toBe(123);
    expect(stock.virtualCreditPendingDelta).toBe(-120);
    expect(stock.physicalCashAvailable).toBe(423);
    expect(stock.virtualCreditAvailable).toBe(380);
    expect(stock.invariantResidual).toBe(0);

    // File d'attente de synchro bien alimentée sans doublon
    const queuedLedger = await db.syncQueue
      .where('entity')
      .equals('financialLedger')
      .toArray();
    expect(queuedLedger.length).toBeGreaterThanOrEqual(1);
  });

  it('bloque une dépense hors-ligne si le crédit disponible (confirmé + delta en attente) devient insuffisant', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 100,
      initialVirtualCredit: 200,
      centralFundingSource: 'Coffre Central',
      reason: 'Init offline',
      actor: DG_USER,
    });

    await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      currency: 'USD',
      amount: 150,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    // Reste 50 USD disponibles -> une 2e opération de 80 USD doit être bloquée même hors-ligne
    await expect(
      recordAgentTransaction({
        transactionType: 'depot_client',
        operator: 'vodacom',
        currency: 'USD',
        amount: 80,
        agencyName: 'Agence Goma Centre',
        agent: AGENT_GOMA_1,
        forceOffline: true,
      })
    ).rejects.toThrowError(INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE);
  });

  it('reprise après reconnexion : convergence idempotente sans double comptage', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 500,
      initialVirtualCredit: 500,
      centralFundingSource: 'Coffre DG',
      reason: 'Init',
      actor: DG_USER,
    });

    const idemKey = buildIdempotencyKey('offline-sync-idem', 'tx-offline-1');
    const txRes = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'orange',
      currency: 'USD',
      amount: 100,
      agencyName: 'Agence Goma Centre',
      idempotencyKey: idemKey,
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    const entryId = txRes.ledgerEntries[0].id;

    // 1re confirmation serveur
    const sync1 = await reconcileOfflineLedgerPushWithServerStock({
      entryId,
      serverStock: {
        virtualCreditConfirmed: 500,
        physicalCashConfirmed: 500,
        status: 'active',
      },
    });
    expect(sync1.status).toBe('confirmee_serveur');

    // Rejeu idempotent de la même écriture / transaction
    await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'orange',
      currency: 'USD',
      amount: 100,
      agencyName: 'Agence Goma Centre',
      idempotencyKey: idemKey,
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    const stock = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'USD'));
    expect(stock?.virtualCreditAvailable).toBe(400);
    expect(stock?.physicalCashAvailable).toBe(600);
    expect(stock?.invariantResidual).toBe(0);
  });

  it('détecte un conflit serveur lors d’une dépense concurrente sur deux appareils sans écrasement silencieux ni solde négatif', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 200,
      initialVirtualCredit: 200,
      centralFundingSource: 'Coffre DG',
      reason: 'Init',
      actor: DG_USER,
    });

    // Sur appareil A hors ligne, l'agent dépense 180 USD de crédit virtuel
    const offlineTx = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      currency: 'USD',
      amount: 180,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });
    const entryId = offlineTx.ledgerEntries[0].id;

    // Pendant la déconnexion, un autre appareil a consommé 150 USD côté serveur :
    // le crédit confirmé serveur restant n'est plus que de 50 USD.
    const conflictRes = await reconcileOfflineLedgerPushWithServerStock({
      entryId,
      serverStock: {
        virtualCreditConfirmed: 50,
        physicalCashConfirmed: 350,
        status: 'active',
      },
    });

    expect(conflictRes.status).toBe('en_conflit');
    expect(conflictRes.reason).toMatch(/Conflit de synchronisation/i);

    // L'écriture et la transaction locales sont conservées et marquées en_conflit (pas de perte)
    const entryAfter = await db.financialLedger.get(entryId);
    const txAfter = await db.financialTransactions.get(offlineTx.transaction.id);
    const stockAfter = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'USD'));
    const anomalies = await db.financialAnomalies.toArray();

    expect(entryAfter?.syncLifecycle).toBe('en_conflit');
    expect(entryAfter?.syncStatus).toBe('conflict');
    expect(txAfter?.status).toBe('en_conflit');
    expect(stockAfter?.syncStatus).toBe('conflict');
    // Le stock n'est pas corrompu en négatif
    expect(stockAfter!.virtualCreditAvailable).toBeGreaterThanOrEqual(0);
    expect(anomalies.some((a) => a.linkedLedgerEntryId === entryId)).toBe(true);
  });
});

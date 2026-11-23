import { beforeEach, describe, expect, it } from 'vitest';
import { db, type LocalSmsOperation } from '../../lib/db';
import { recordAgentTransaction } from '../AgentTransactionService';
import { buildStockId } from '../FinancialLedgerService';
import { allocateInitialEndowment } from '../FundAllocationService';
import {
  reconcileSmsOperationWithTransactions,
  reconcileTransactionWithSmsOperations,
  resolveReconciliationManually,
} from '../SmsReconciliationService';
import { AGENT_GOMA_1, DG_USER, resetFinancialTestDatabase } from './testHelpers';

function buildSms(overrides: Partial<LocalSmsOperation>): LocalSmsOperation {
  const now = Date.now();
  return {
    id: `sms-${now}-${Math.random().toString(36).slice(2, 7)}`,
    internalNumberId: 'num-mpesa-goma-1',
    agencyId: 'ag-goma-1',
    operator: 'vodacom',
    sender: 'M-PESA',
    rawMessage: 'M-Pesa transaction confirmée',
    amount: 100,
    currency: 'USD',
    transactionReference: 'MPESA-REF-001',
    transactionType: 'retrait',
    operationDate: now,
    status: 'pending',
    reconciliationStatus: 'unmatched',
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('18.3 Rapprochement SMS Mobile Money Ets AMANI', () => {
  beforeEach(async () => {
    await resetFinancialTestDatabase();
    await allocateInitialEndowment({
      targetAgent: {
        uid: AGENT_GOMA_1.uid,
        displayName: AGENT_GOMA_1.displayName,
        agencyId: 'ag-goma-1',
        agencyName: 'Agence Goma Centre',
      },
      currency: 'USD',
      initialPhysicalCash: 1000,
      initialVirtualCredit: 1000,
      centralFundingSource: 'Coffre DG',
      reason: 'Dotation tests SMS',
      actor: DG_USER,
    });
  });

  it('rapproche automatiquement un SMS valide (référence + montant + opérateur + fenêtre) à la transaction déclarée', async () => {
    const sms = buildSms({
      transactionReference: 'MP26112301',
      amount: 200,
      currency: 'USD',
      transactionType: 'retrait',
    });
    await db.smsOperations.put(sms);

    const res = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      internalNumberId: 'num-mpesa-goma-1',
      externalOperatorRef: 'MP26112301',
      currency: 'USD',
      amount: 200,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(res.transaction.reconciliationStatus).toBe('rapprochee');
    expect(res.transaction.linkedSmsOperationId).toBe(sms.id);
    const updatedSms = await db.smsOperations.get(sms.id);
    expect(updatedSms?.status).toBe('matched');
    expect(updatedSms?.reconciledOperationId).toBe(res.transaction.id);
  });

  it('SMS capté sans déclaration crée une alerte sms_sans_declaration SANS modifier agentFundStocks', async () => {
    const stockBefore = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'USD'));
    const sms = buildSms({
      transactionReference: 'MP-ORPHAN-99',
      amount: 350,
      currency: 'USD',
      internalNumberId: 'num-unlinked',
    });
    await db.smsOperations.put(sms);

    const rec = await reconcileSmsOperationWithTransactions(sms);
    expect(rec?.status).toBe('non_declaree');

    const stockAfter = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'USD'));
    expect(stockAfter?.virtualCreditAvailable).toBe(stockBefore?.virtualCreditAvailable);
    expect(stockAfter?.physicalCashAvailable).toBe(stockBefore?.physicalCashAvailable);

    const anomalies = await db.financialAnomalies.toArray();
    expect(anomalies.some((a) => a.anomalyType === 'sms_sans_declaration')).toBe(true);
  });

  it('déclaration sans SMS hors fenêtre génère declaration_sans_sms et une anomalie', async () => {
    const res = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'airtel',
      externalOperatorRef: 'AIRTEL-MISSING-1',
      currency: 'USD',
      amount: 75,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    // Vieillir deviceTimestamp au-delà de 30 minutes
    const agedTx = {
      ...res.transaction,
      deviceTimestamp: Date.now() - 60 * 60 * 1000,
    };
    await db.financialTransactions.put(agedTx);

    const rec = await reconcileTransactionWithSmsOperations(agedTx);
    expect(rec).toBeNull();

    const updatedTx = await db.financialTransactions.get(agedTx.id);
    expect(updatedTx?.reconciliationStatus).toBe('declaration_sans_sms');

    const anomalies = await db.financialAnomalies.toArray();
    expect(anomalies.some((a) => a.anomalyType === 'declaration_sans_sms')).toBe(true);
  });

  it('détecte un écart de montant entre le SMS et la déclaration agent (montant_different + anomalie)', async () => {
    const sms = buildSms({
      transactionReference: 'MP-GAP-77',
      amount: 180,
      currency: 'USD',
      transactionType: 'retrait',
    });
    await db.smsOperations.put(sms);

    const res = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      internalNumberId: 'num-mpesa-goma-1',
      externalOperatorRef: 'MP-GAP-77',
      currency: 'USD',
      amount: 200, // Écart de 20 USD !
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(res.transaction.reconciliationStatus).toBe('montant_different');
    const anomalies = await db.financialAnomalies.toArray();
    const gapAno = anomalies.find((a) => a.anomalyType === 'ecart_montant_sms');
    expect(gapAno).toBeDefined();
    expect(gapAno?.discrepancyAmount).toBe(20);
  });

  it('bloque une référence opérateur déjà rapprochée / dupliquée et lève reference_dupliquee', async () => {
    const sms = buildSms({
      transactionReference: 'MP-DUP-55',
      amount: 100,
      currency: 'USD',
    });
    await db.smsOperations.put(sms);

    const tx1 = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      internalNumberId: 'num-mpesa-goma-1',
      externalOperatorRef: 'MP-DUP-55',
      currency: 'USD',
      amount: 100,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });
    expect(tx1.transaction.reconciliationStatus).toBe('rapprochee');

    const tx2 = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      internalNumberId: 'num-mpesa-goma-1',
      externalOperatorRef: 'MP-DUP-55',
      currency: 'USD',
      amount: 100,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(tx2.transaction.reconciliationStatus).toBe('reference_dupliquee');
    const anomalies = await db.financialAnomalies.toArray();
    expect(anomalies.some((a) => a.anomalyType === 'reference_dupliquee')).toBe(true);
  });

  it('classe un SMS tardif hors fenêtre en a_verifier_manuellement puis permet validation manuelle par DG', async () => {
    const oldTime = Date.now() - 3 * 3600 * 1000;
    const sms = buildSms({
      transactionReference: 'MP-LATE-01',
      amount: 90,
      currency: 'USD',
      operationDate: oldTime,
      receivedAt: oldTime,
    });
    await db.smsOperations.put(sms);

    const res = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      internalNumberId: 'num-mpesa-goma-1',
      externalOperatorRef: 'MP-LATE-01',
      currency: 'USD',
      amount: 90,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(res.transaction.reconciliationStatus).toBe('a_verifier_manuellement');

    const recs = await db.reconciliationRecords.toArray();
    const rec = recs.find((r) => r.financialTransactionId === res.transaction.id);
    expect(rec).toBeDefined();

    const resolved = await resolveReconciliationManually({
      recordId: rec!.id,
      resolutionNote: 'Retard réseau Vodacom confirmé',
      supervisor: DG_USER,
    });
    expect(resolved.status).toBe('validee_manuellement');
  });

  it('détecte deux SMS ambigus sans référence unique et classe en doublon_potentiel', async () => {
    const now = Date.now();
    await db.smsOperations.bulkPut([
      buildSms({
        id: 'sms-amb-1',
        transactionReference: undefined,
        amount: 60,
        currency: 'USD',
        internalNumberId: 'num-mpesa-goma-1',
        receivedAt: now - 1000,
        operationDate: now - 1000,
      }),
      buildSms({
        id: 'sms-amb-2',
        transactionReference: undefined,
        amount: 60,
        currency: 'USD',
        internalNumberId: 'num-mpesa-goma-1',
        receivedAt: now - 2000,
        operationDate: now - 2000,
      }),
    ]);

    const res = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      internalNumberId: 'num-mpesa-goma-1',
      currency: 'USD',
      amount: 60,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(res.transaction.reconciliationStatus).toBe('doublon_potentiel');
    const anomalies = await db.financialAnomalies.toArray();
    expect(anomalies.some((a) => a.anomalyType === 'doublon_suspect')).toBe(true);
  });

  it('SMS reçu sur numéro non rattaché à un agent reste traçable en non_declaree avec agentOrNumberMatch=false', async () => {
    const sms = buildSms({
      internalNumberId: '',
      transactionReference: 'MP-UNLINKED-77',
      amount: 45,
      currency: 'USD',
    });
    await db.smsOperations.put(sms);

    const rec = await reconcileSmsOperationWithTransactions(sms);
    expect(rec).not.toBeNull();
    expect(rec?.status).toBe('non_declaree');
    expect(rec?.agentId).toBeNull();
    expect(rec?.matchedCriteria.agentOrNumberMatch).toBe(false);
    expect(rec?.resolutionNote).toMatch(/non encore rattaché/i);
  });
});

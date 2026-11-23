import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../lib/db';
import { INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE } from '../../types/financialSupervision';
import { recordAgentTransaction } from '../AgentTransactionService';
import { buildStockId } from '../FinancialLedgerService';
import {
  allocateInitialEndowment,
  allocateVirtualCredit,
  confirmCashHandover,
  createCompensatingReversal,
  initiateCashHandover,
} from '../FundAllocationService';
import {
  requestPhysicalInventory,
  submitAgentInventoryCount,
  validateAndLockInventory,
} from '../InventoryControlService';
import {
  approveReplenishmentRequest,
  rejectReplenishmentRequest,
  submitReplenishmentRequest,
} from '../ReplenishmentService';
import { AGENT_GOMA_1, DG_USER, resetFinancialTestDatabase } from './testHelpers';

const AGENT_TARGET = {
  uid: AGENT_GOMA_1.uid,
  displayName: AGENT_GOMA_1.displayName,
  agencyId: 'ag-goma-1',
  agencyName: 'Agence Goma Centre',
};

describe('18.1 Comptabilité & Intégrité Financière Ets AMANI', () => {
  beforeEach(async () => {
    await resetFinancialTestDatabase();
  });

  it('dotation initiale USD + CDF sépare strictement les deux devises et maintient invariantResidual == 0', async () => {
    const usdRes = await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 1000,
      initialVirtualCredit: 500,
      centralFundingSource: 'Coffre Central DG',
      reason: 'Dotation ouverture USD',
      actor: DG_USER,
    });

    const cdfRes = await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'CDF',
      initialPhysicalCash: 500000,
      initialVirtualCredit: 250000,
      centralFundingSource: 'Coffre Central DG CDF',
      reason: 'Dotation ouverture CDF',
      actor: DG_USER,
    });

    expect(usdRes.stock.physicalCashAvailable).toBe(1000);
    expect(usdRes.stock.virtualCreditAvailable).toBe(500);
    expect(usdRes.stock.netAttributedCapital).toBe(1500);
    expect(usdRes.stock.invariantResidual).toBe(0);

    expect(cdfRes.stock.physicalCashAvailable).toBe(500000);
    expect(cdfRes.stock.virtualCreditAvailable).toBe(250000);
    expect(cdfRes.stock.netAttributedCapital).toBe(750000);
    expect(cdfRes.stock.invariantResidual).toBe(0);

    // Aucune fusion USD/CDF dans les enregistrements stock
    const usdStock = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'USD'));
    const cdfStock = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'CDF'));
    expect(usdStock?.currency).toBe('USD');
    expect(cdfStock?.currency).toBe('CDF');
  });

  it('dépôt client augmente cash physique et diminue crédit virtuel ; retrait client diminue cash et augmente crédit virtuel', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 400,
      initialVirtualCredit: 600,
      centralFundingSource: 'Banque Centrale',
      reason: 'Dotation',
      actor: DG_USER,
    });

    const depot = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      currency: 'USD',
      amount: 200,
      feeAmount: 5,
      feeMode: 'cash_encaisse',
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(depot.stocks[0].physicalCashAvailable).toBe(605);
    expect(depot.stocks[0].virtualCreditAvailable).toBe(400);
    expect(depot.stocks[0].totalFeesCollected).toBe(5);
    expect(depot.stocks[0].invariantResidual).toBe(0);

    const retrait = await recordAgentTransaction({
      transactionType: 'retrait_client',
      operator: 'vodacom',
      currency: 'USD',
      amount: 150,
      feeAmount: 2,
      feeMode: 'cash_encaisse',
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(retrait.stocks[0].physicalCashAvailable).toBe(457);
    expect(retrait.stocks[0].virtualCreditAvailable).toBe(550);
    expect(retrait.stocks[0].totalFeesCollected).toBe(7);
    expect(retrait.stocks[0].invariantResidual).toBe(0);
  });

  it('cumul multiple opérations : conserve exactement l’invariant comptable sur USD & CDF', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 300,
      initialVirtualCredit: 700,
      centralFundingSource: 'Coffre DG',
      reason: 'Capital départ',
      actor: DG_USER,
    });

    await allocateVirtualCredit({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      amount: 300,
      centralFundingSource: 'M-Pesa Master DG',
      reason: 'Renfort crédit',
      actor: DG_USER,
    });

    await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'airtel',
      currency: 'USD',
      amount: 450,
      feeAmount: 10,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    await recordAgentTransaction({
      transactionType: 'retrait_abonne',
      operator: 'orange',
      currency: 'USD',
      amount: 200,
      feeAmount: 4,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    const handover = await initiateCashHandover({
      direction: 'agent_vers_direction',
      agent: AGENT_TARGET,
      currency: 'USD',
      amount: 250,
      reason: 'Versement fin journée',
      actor: AGENT_GOMA_1,
    });
    const confirmed = await confirmCashHandover({
      handoverId: handover.id,
      confirmer: DG_USER,
    });

    // Cash = 300 + 460 - 196 - 250 = 314 ; Virtuel = 700 + 300 - 450 + 200 = 750
    // Capital net = 1000 + 300 - 250 = 1050 ; Frais = 14 ; Cash+Virtuel = 1064 == 1050 + 14
    expect(confirmed.stock.physicalCashAvailable).toBe(314);
    expect(confirmed.stock.virtualCreditAvailable).toBe(750);
    expect(confirmed.stock.netAttributedCapital).toBe(1050);
    expect(confirmed.stock.totalFeesCollected).toBe(14);
    expect(confirmed.stock.invariantResidual).toBe(0);
  });

  it('bloque un dépôt/transaction lorsque le crédit virtuel est insuffisant avec le message français exact et crée une anomalie', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 500,
      initialVirtualCredit: 100,
      centralFundingSource: 'Coffre DG',
      reason: 'Dotation',
      actor: DG_USER,
    });

    await expect(
      recordAgentTransaction({
        transactionType: 'depot_client',
        operator: 'vodacom',
        currency: 'USD',
        amount: 150,
        agencyName: 'Agence Goma Centre',
        agent: AGENT_GOMA_1,
        forceOffline: true,
      })
    ).rejects.toThrowError(INSUFFICIENT_VIRTUAL_CREDIT_MESSAGE);

    const stockAfter = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'USD'));
    expect(stockAfter?.virtualCreditAvailable).toBe(100);
    expect(stockAfter?.physicalCashAvailable).toBe(500);

    const anomalies = await db.financialAnomalies.toArray();
    expect(anomalies.some((a) => a.anomalyType === 'tentative_credit_insuffisant')).toBe(true);
  });

  it('bloque un retrait lorsque le cash physique disponible est insuffisant', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'CDF',
      initialPhysicalCash: 50000,
      initialVirtualCredit: 200000,
      centralFundingSource: 'Coffre DG',
      reason: 'Dotation CDF',
      actor: DG_USER,
    });

    await expect(
      recordAgentTransaction({
        transactionType: 'retrait_client',
        operator: 'airtel',
        currency: 'CDF',
        amount: 80000,
        agencyName: 'Agence Goma Centre',
        agent: AGENT_GOMA_1,
        forceOffline: true,
      })
    ).rejects.toThrow(/cash physique disponible/i);
  });

  it('réapprovisionnement demandé -> approuvé crédite le stock ; refusé ne modifie pas le stock', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 100,
      initialVirtualCredit: 50,
      centralFundingSource: 'Coffre DG',
      reason: 'Dotation initiale',
      actor: DG_USER,
    });

    const reqApprove = await submitReplenishmentRequest({
      requestType: 'credit_virtuel',
      currency: 'USD',
      requestedAmount: 400,
      reason: 'Forte affluence M-Pesa',
      urgency: 'urgente',
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
    });

    const approved = await approveReplenishmentRequest({
      requestId: reqApprove.id,
      centralFundingSource: 'Compte Master DG M-Pesa',
      supervisor: DG_USER,
    });
    expect(approved.stock.virtualCreditAvailable).toBe(450);
    expect(approved.stock.invariantResidual).toBe(0);

    const reqReject = await submitReplenishmentRequest({
      requestType: 'cash_physique',
      currency: 'USD',
      requestedAmount: 1000,
      reason: 'Demande excédentaire',
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
    });
    const rejected = await rejectReplenishmentRequest({
      requestId: reqReject.id,
      rejectionReason: 'Liquidité suffisante en caisse',
      supervisor: DG_USER,
    });
    expect(rejected.status).toBe('rejetee');

    const finalStock = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'USD'));
    expect(finalStock?.physicalCashAvailable).toBe(100);
    expect(finalStock?.virtualCreditAvailable).toBe(450);
  });

  it('change de devise USD <-> CDF génère deux écritures indépendantes et conserve les deux invariants', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 200,
      initialVirtualCredit: 0,
      centralFundingSource: 'Coffre DG',
      reason: 'USD',
      actor: DG_USER,
    });
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'CDF',
      initialPhysicalCash: 1000000,
      initialVirtualCredit: 0,
      centralFundingSource: 'Coffre DG',
      reason: 'CDF',
      actor: DG_USER,
    });

    const fxRes = await recordAgentTransaction({
      transactionType: 'change_devise',
      operator: 'caisse_interne',
      currency: 'USD',
      amount: 100,
      targetCurrency: 'CDF',
      targetAmount: 280000,
      exchangeRate: 2800,
      fxExecutionChannel: 'cash_contre_cash',
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(fxRes.ledgerEntries).toHaveLength(2);
    const usdStock = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'USD'));
    const cdfStock = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'CDF'));

    expect(usdStock?.physicalCashAvailable).toBe(300);
    expect(usdStock?.totalFxNet).toBe(100);
    expect(usdStock?.invariantResidual).toBe(0);

    expect(cdfStock?.physicalCashAvailable).toBe(720000);
    expect(cdfStock?.totalFxNet).toBe(-280000);
    expect(cdfStock?.invariantResidual).toBe(0);
  });

  it('contrepassation crée une écriture compensatrice immuable sans modifier ni supprimer l’écriture d’origine', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 500,
      initialVirtualCredit: 500,
      centralFundingSource: 'Coffre DG',
      reason: 'Dotation',
      actor: DG_USER,
    });

    const txRes = await recordAgentTransaction({
      transactionType: 'depot_client',
      operator: 'vodacom',
      currency: 'USD',
      amount: 100,
      feeAmount: 5,
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    const originalEntry = txRes.ledgerEntries[0];
    const reversal = await createCompensatingReversal({
      targetEntryId: originalEntry.id,
      reason: 'Erreur de saisie montant client',
      actor: DG_USER,
    });

    // Écriture originale intacte
    const preservedOriginal = await db.financialLedger.get(originalEntry.id);
    expect(preservedOriginal).toBeDefined();
    expect(preservedOriginal?.physicalCashDelta).toBe(105);
    expect(preservedOriginal?.virtualCreditDelta).toBe(-100);

    // Nouvelle écriture inverse exacte
    expect(reversal.reversalEntry.reversedEntryId).toBe(originalEntry.id);
    expect(reversal.reversalEntry.physicalCashDelta).toBe(-105);
    expect(reversal.reversalEntry.virtualCreditDelta).toBe(100);
    expect(reversal.stock.physicalCashAvailable).toBe(500);
    expect(reversal.stock.virtualCreditAvailable).toBe(500);
    expect(reversal.stock.invariantResidual).toBe(0);
  });

  it('inventaire avec écart génère anomalie ecart_inventaire et ajustement comptable optionnel', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 500,
      initialVirtualCredit: 400,
      centralFundingSource: 'Coffre DG',
      reason: 'Dotation',
      actor: DG_USER,
    });

    const inv = await requestPhysicalInventory({
      agentId: AGENT_GOMA_1.uid,
      agentName: AGENT_GOMA_1.displayName,
      agencyId: 'ag-goma-1',
      agencyName: 'Agence Goma Centre',
      controlType: 'inopine',
      supervisor: DG_USER,
    });

    const submitted = await submitAgentInventoryCount({
      inventoryId: inv.id,
      countedPhysicalCashUsd: 480, // manquant -20 USD
      countedPhysicalCashCdf: 0,
      virtualChannelsBreakdown: [
        { operator: 'vodacom', currency: 'USD', countedAmount: 400 },
      ],
      agent: AGENT_GOMA_1,
    });
    expect(submitted.discrepancyCashUsd).toBe(-20);

    const locked = await validateAndLockInventory({
      inventoryId: submitted.id,
      validationNotes: 'Manquant constaté et imputé en ajustement',
      applyCompensatingLedgerAdjustment: true,
      supervisor: DG_USER,
    });

    expect(locked.immutableLocked).toBe(true);
    expect(locked.status).toBe('ecart_negatif');
    expect(locked.linkedAnomalyIds).toHaveLength(1);
    expect(locked.linkedAdjustmentLedgerIds).toHaveLength(1);

    const adjustedStock = await db.agentFundStocks.get(buildStockId(AGENT_GOMA_1.uid, 'USD'));
    expect(adjustedStock?.physicalCashAvailable).toBe(480);
    expect(adjustedStock?.totalInventoryAdjustments).toBe(-20);
    expect(adjustedStock?.invariantResidual).toBe(0);
  });

  it('enregistre une commission_frais sans rompre l’invariant comptable', async () => {
    await allocateInitialEndowment({
      targetAgent: AGENT_TARGET,
      currency: 'USD',
      initialPhysicalCash: 250,
      initialVirtualCredit: 300,
      centralFundingSource: 'Coffre DG',
      reason: 'Dotation',
      actor: DG_USER,
    });

    const comm = await recordAgentTransaction({
      transactionType: 'commission_frais',
      operator: 'vodacom',
      currency: 'USD',
      amount: 15,
      feeMode: 'cash_encaisse',
      agencyName: 'Agence Goma Centre',
      agent: AGENT_GOMA_1,
      forceOffline: true,
    });

    expect(comm.stocks[0].physicalCashAvailable).toBe(265);
    expect(comm.stocks[0].virtualCreditAvailable).toBe(300);
    expect(comm.stocks[0].totalFeesCollected).toBe(15);
    expect(comm.stocks[0].invariantResidual).toBe(0);
  });
});

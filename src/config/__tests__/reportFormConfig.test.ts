import { describe, expect, it } from 'vitest';
import {
  CATEGORY_TO_PROFILE,
  REPORT_FORM_CONFIGURATIONS,
  getReportFormConfig,
  getSectionsVisibilitySummary,
  getVisibleMetricCards,
  isCategoryFieldVisible,
  isCategoryFieldVisibleForContext,
  isSectionVisible,
  mapFunctionToReportCategory,
  resolveReportConfigForUser,
  resolveReportUserProfile,
  validateReportAgainstConfig,
} from '../reportFormConfig';
import type { AgentCategorySpecificData } from '../../types/report';

describe('Configuration centralisée des formulaires de rapport (reportFormConfig)', () => {
  describe('Résolution du profil utilisateur', () => {
    it('résout chaque fonction métier simple vers le profil correspondant', () => {
      expect(resolveReportUserProfile('comptable', 'agent')).toBe('agent_comptable');
      expect(resolveReportUserProfile('comptabilite', 'agent')).toBe('agent_comptable');
      expect(resolveReportUserProfile('guichetier', 'agent')).toBe('guichetier');
      expect(resolveReportUserProfile('caisse', 'agent')).toBe('caissier');
      expect(resolveReportUserProfile('agent_change', 'agent')).toBe('agent_change');
      expect(resolveReportUserProfile('agent_virtuel', 'agent')).toBe('agent_virtuel');
      expect(resolveReportUserProfile('agent_vodae', 'agent')).toBe('agent_virtuel');
      expect(resolveReportUserProfile('agent_operateur_mobile', 'agent')).toBe('agent_virtuel');
      expect(resolveReportUserProfile('agent_terrain', 'agent')).toBe('agent_terrain');
      expect(resolveReportUserProfile('chauffeur', 'agent')).toBe('agent_terrain');
      expect(resolveReportUserProfile('cleaner', 'agent')).toBe('agent_terrain');
    });

    it('résout les rôles de direction vers direction_agence même si une fonction est présente', () => {
      expect(resolveReportUserProfile('guichetier', 'administrateur_agence')).toBe('direction_agence');
      expect(resolveReportUserProfile('comptable', 'directeur_general')).toBe('direction_agence');
      expect(resolveReportUserProfile(undefined, 'administrateur_systeme')).toBe('direction_agence');
    });

    it('détecte les agents polyvalents via multiServiceEnabled ou functions[] / serviceAssignments[]', () => {
      expect(resolveReportUserProfile('guichetier', 'agent', true)).toBe('agent_polyvalent');
      expect(resolveReportUserProfile('guichetier', 'agent', false, ['guichetier', 'caisse'])).toBe(
        'agent_polyvalent'
      );

      // Deux fonctions mappées vers la même catégorie restent sur le profil unique
      expect(resolveReportUserProfile('agent_terrain', 'agent', false, ['agent_terrain', 'chauffeur'])).toBe(
        'agent_terrain'
      );

      const futureEnd = Date.now() + 3600_000;
      const resolvedMulti = resolveReportConfigForUser({
        role: 'agent',
        function: 'guichetier',
        serviceAssignments: [
          { service: 'caisse', status: 'approved', active: true, endAt: futureEnd },
        ],
      });
      expect(resolvedMulti.profile).toBe('agent_polyvalent');

      // Une affectation expirée ou non approuvée ne déclenche pas polyvalent
      const resolvedExpired = resolveReportConfigForUser({
        role: 'agent',
        function: 'guichetier',
        serviceAssignments: [
          { service: 'caisse', status: 'approved', active: true, endAt: Date.now() - 1000 },
          { service: 'comptable', status: 'pending', active: true },
        ],
      });
      expect(resolvedExpired.profile).toBe('guichetier');
    });

    it('retombe sur le profil général si aucune fonction ni rôle directeur n’est reconnu', () => {
      expect(resolveReportUserProfile(undefined, 'agent')).toBe('general');
      expect(resolveReportConfigForUser(null).profile).toBe('general');
    });

    it('associe correctement les catégories adaptatives et fonctions', () => {
      expect(mapFunctionToReportCategory('comptabilite')).toBe('comptable');
      expect(mapFunctionToReportCategory('agent_vodae')).toBe('agent_virtuel');
      expect(mapFunctionToReportCategory('chauffeur')).toBe('agent_terrain');
      expect(CATEGORY_TO_PROFILE.caisse).toBe('caissier');
      expect(CATEGORY_TO_PROFILE.comptable).toBe('agent_comptable');
    });
  });

  describe('Visibilité dynamique des sections et métriques (mode guidé vs personnalisé)', () => {
    it('masque le billetage et les écarts de caisse pour un guichetier en mode guidé', () => {
      const cfg = getReportFormConfig('guichetier', 'agent');
      expect(isSectionVisible(cfg, 'billetage', 'guide')).toBe(false);
      expect(isSectionVisible(cfg, 'metrics', 'guide')).toBe(true);
      expect(cfg.sections.general.showNotes).toBe(false);

      const cards = getVisibleMetricCards(cfg, 'guide');
      expect(cards.showMissions).toBe(true);
      expect(cards.showUsdVolume).toBe(true);
      expect(cards.showCdfVolume).toBe(true);
      expect(cards.showBilletage).toBe(false);
      expect(cards.showDiscrepancy).toBe(false);

      const summary = getSectionsVisibilitySummary(cfg, 'guide');
      expect(summary.visibleCount).toBe(9);
      expect(summary.totalCount).toBe(10);
      expect(summary.hiddenLabels).toContain('Billetage');
    });

    it('masque les métriques financières et le billetage pour un agent de terrain en mode guidé', () => {
      const cfg = getReportFormConfig('agent_terrain', 'agent');
      expect(isSectionVisible(cfg, 'metrics', 'guide')).toBe(false);
      expect(isSectionVisible(cfg, 'billetage', 'guide')).toBe(false);

      const summary = getSectionsVisibilitySummary(cfg, 'guide');
      expect(summary.visibleCount).toBe(8);
      expect(summary.hiddenLabels).toEqual(['Métriques vérifiées', 'Billetage']);
    });

    it('affiche toutes les sections et cartes métriques pour un agent comptable et un caissier', () => {
      const comptable = getReportFormConfig('comptable', 'agent');
      expect(isSectionVisible(comptable, 'billetage', 'guide')).toBe(true);
      expect(comptable.sections.billetage.required).toBe(false);
      expect(getVisibleMetricCards(comptable, 'guide')).toEqual({
        showMissions: true,
        showUsdVolume: true,
        showCdfVolume: true,
        showBilletage: true,
        showDiscrepancy: true,
      });

      const caissier = getReportFormConfig('caisse', 'agent');
      expect(isSectionVisible(caissier, 'billetage', 'guide')).toBe(true);
      expect(caissier.sections.billetage.required).toBe(true);
    });

    it('déverrouille toutes les sections et cartes métriques en mode personnalisé', () => {
      const terrain = REPORT_FORM_CONFIGURATIONS.agent_terrain;
      expect(isSectionVisible(terrain, 'metrics', 'personnalise')).toBe(true);
      expect(isSectionVisible(terrain, 'billetage', 'personnalise')).toBe(true);
      expect(getSectionsVisibilitySummary(terrain, 'personnalise').visibleCount).toBe(10);
      expect(getVisibleMetricCards(terrain, 'personnalise')).toEqual({
        showMissions: true,
        showUsdVolume: true,
        showCdfVolume: true,
        showBilletage: true,
        showDiscrepancy: true,
      });
    });
  });

  describe('Filtrage dynamique des champs métier selon le profil et les services actifs', () => {
    it('filtre strictement les champs par profil en mode guidé et ouvre tout en mode personnalisé', () => {
      const guichetier = REPORT_FORM_CONFIGURATIONS.guichetier;
      expect(isCategoryFieldVisible(guichetier, 'tellerOperationsCount', 'guide')).toBe(true);
      expect(isCategoryFieldVisible(guichetier, 'clientsServedCount', 'guide')).toBe(true);
      expect(isCategoryFieldVisible(guichetier, 'cashRegisterIdentifier', 'guide')).toBe(false);
      expect(isCategoryFieldVisible(guichetier, 'reconciliationsDoneCount', 'guide')).toBe(false);
      expect(isCategoryFieldVisible(guichetier, 'cashRegisterIdentifier', 'personnalise')).toBe(true);

      const comptable = REPORT_FORM_CONFIGURATIONS.agent_comptable;
      const expectedComptableFields: Array<keyof AgentCategorySpecificData> = [
        'accountingPeriodName',
        'filesProcessedCount',
        'operationsBookedCount',
        'reconciliationsDoneCount',
        'discrepanciesCount',
        'missingReceiptsCount',
        'accountingCorrectiveActions',
        'accountingObservations',
      ];
      for (const f of expectedComptableFields) {
        expect(isCategoryFieldVisible(comptable, f, 'guide')).toBe(true);
      }
      expect(isCategoryFieldVisible(comptable, 'assignedMissionTitle', 'guide')).toBe(false);
    });

    it('calcule dynamiquement l’union des champs autorisés pour un agent polyvalent', () => {
      const poly = REPORT_FORM_CONFIGURATIONS.agent_polyvalent;

      // Cas 1 : Guichetier + Agent Virtuel uniquement -> champs Caisse et Terrain masqués
      expect(
        isCategoryFieldVisibleForContext(poly, 'tellerOperationsCount', 'polyvalent', ['guichetier', 'agent_virtuel'], 'guide')
      ).toBe(true);
      expect(
        isCategoryFieldVisibleForContext(poly, 'virtualOperationsCount', 'polyvalent', ['guichetier', 'agent_virtuel'], 'guide')
      ).toBe(true);
      expect(
        isCategoryFieldVisibleForContext(poly, 'cashRegisterIdentifier', 'polyvalent', ['guichetier', 'agent_virtuel'], 'guide')
      ).toBe(false);
      expect(
        isCategoryFieldVisibleForContext(poly, 'assignedMissionTitle', 'polyvalent', ['guichetier', 'agent_virtuel'], 'guide')
      ).toBe(false);

      // Cas 2 : Caisse + Comptable -> champs Caisse et Comptable visibles
      expect(
        isCategoryFieldVisibleForContext(poly, 'cashIncidentsNotes', 'polyvalent', ['caisse', 'comptable'], 'guide')
      ).toBe(true);
      expect(
        isCategoryFieldVisibleForContext(poly, 'accountingPeriodName', 'polyvalent', ['caisse', 'comptable'], 'guide')
      ).toBe(true);
    });
  });

  describe('Validation métier avant soumission officielle', () => {
    it('exige la certification et un titre pour tous les profils', () => {
      const guichetier = REPORT_FORM_CONFIGURATIONS.guichetier;
      expect(
        validateReportAgainstConfig(guichetier, 'guide', {
          title: 'Rapport guichet',
          executiveSummary: 'Synthèse complète',
          activitiesCount: 1,
          certifiedAccepted: false,
        }).valid
      ).toBe(false);

      expect(
        validateReportAgainstConfig(guichetier, 'guide', {
          title: '   ',
          executiveSummary: 'Synthèse complète',
          activitiesCount: 1,
          certifiedAccepted: true,
        }).valid
      ).toBe(false);
    });

    it('impose le billetage uniquement aux profils où il est requis (ex: caissier) en mode guidé', () => {
      const caissier = REPORT_FORM_CONFIGURATIONS.caissier;
      const missingBilletage = validateReportAgainstConfig(caissier, 'guide', {
        title: 'Clôture caisse agence',
        executiveSummary: 'Caisse équilibrée',
        activitiesCount: 1,
        linkedBilletageId: '',
        certifiedAccepted: true,
      });
      expect(missingBilletage.valid).toBe(false);
      expect(missingBilletage.error).toContain('billetage');

      const withBilletage = validateReportAgainstConfig(caissier, 'guide', {
        title: 'Clôture caisse agence',
        executiveSummary: 'Caisse équilibrée',
        activitiesCount: 1,
        linkedBilletageId: 'bil-001',
        certifiedAccepted: true,
      });
      expect(withBilletage.valid).toBe(true);

      // Pour un guichetier (billetage masqué/non requis), l'absence de billetage est valide
      const guichetierValid = validateReportAgainstConfig(REPORT_FORM_CONFIGURATIONS.guichetier, 'guide', {
        title: 'Rapport guichet',
        executiveSummary: 'Journée normale',
        activitiesCount: 1,
        linkedBilletageId: '',
        certifiedAccepted: true,
      });
      expect(guichetierValid.valid).toBe(true);
    });
  });
});

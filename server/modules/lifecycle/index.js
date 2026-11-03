import { lifecycleService } from './service/lifecycleService.js';

export const lifecycleModule = {
  // Onboarding
  getOnboardingList: lifecycleService.getOnboardingList,
  getOnboardingDetail: lifecycleService.getOnboardingDetail,
  createOnboarding: lifecycleService.createOnboarding,
  updateOnboarding: lifecycleService.updateOnboarding,
  toggleOnboardingTask: lifecycleService.toggleOnboardingTask,

  // Offboarding
  getOffboardingList: lifecycleService.getOffboardingList,
  getOffboardingDetail: lifecycleService.getOffboardingDetail,
  getOffboardingSimple: lifecycleService.getOffboardingSimple,
  createOffboarding: lifecycleService.createOffboarding,
  updateOffboardingStatus: lifecycleService.updateOffboardingStatus,
  toggleClearanceField: lifecycleService.toggleClearanceField,
  releaseSettlement: lifecycleService.releaseSettlement,
  toggleOffboardingTask: lifecycleService.toggleOffboardingTask,
  
  // Exit Surveys
  saveExitInterview: lifecycleService.saveExitInterview,
  getExitSurvey: lifecycleService.getExitSurvey,
  submitExitSurvey: lifecycleService.submitExitSurvey,
  markKnowledgeTransferComplete: lifecycleService.markKnowledgeTransferComplete,
  linkHandover: lifecycleService.linkHandover,
  getActiveOffboardingWarning: lifecycleService.getActiveOffboardingWarning,
  getOffboardingById: lifecycleService.getOffboardingById,
  getLastWorkingDate: lifecycleService.getLastWorkingDate
};

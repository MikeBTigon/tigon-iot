// Insights (Harden & polish release): customer timeline, live board, credit applications, texting inbox,
// weekly owner email, AI help. Pages: frontend/src/mp/insights/.
//
// Always exported (add to FUNCS): mpCreditApi mpCreditSend mpOwnerWeekly mpOwnerWeeklyNow mpAiStatus
// AI (export only when ENABLE_AI_WRITER=true, like mpAiListing; add to FUNCS inside the AI block):
//   exports.mpAiAssist = require('./insights/ai').mpAiAssist;
import {onCall} from 'firebase-functions/v2/https';

export {mpCreditApi, mpCreditSend} from './credit';
export {mpOwnerWeekly, mpOwnerWeeklyNow} from './weekly';

/** Lets the app hide the AI buttons when AI help is not deployed. */
export const mpAiStatus = onCall({memory: '128MiB'}, async (req) => ({
  enabled: !!req.auth && process.env.ENABLE_AI_WRITER === 'true',
}));

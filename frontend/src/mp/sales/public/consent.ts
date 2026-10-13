// Fields every customer form that can lead to texting sends with its POST body (see ConsentCheckbox).
import i18n, { currentLanguage } from '../../../i18n';

/** `{consent, consentText, lang}` — consentText is the exact consent wording shown, in the shown language. */
export const consentPayload = (consent: boolean) => ({
  consent,
  consentText: i18n.t('consent.sms'),
  lang: currentLanguage(),
});

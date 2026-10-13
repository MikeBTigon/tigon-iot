import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, InputAdornment, TextField, Typography,
} from '@mui/material';
import { Call, Email, ExpandMore, RocketLaunch, Search, Sms } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import PreferencesControls from '../../ui/PreferencesControls';
import { useLanguage, useT } from '../../i18n';
import { HELP_AREAS, HELP_ARTICLES, SUPPORT, articleText, type HelpArticle } from './articles';

/** /mp/help — searchable how-to articles, contact support, and display/language preferences. */
const HelpCenter: React.FC = () => {
  const t = useT();
  const lang = useLanguage();
  const [params, setParams] = useSearchParams();
  const openId = params.get('a');
  const [q, setQ] = useState('');

  const articles = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    return HELP_ARTICLES.filter((a) => {
      if (!tokens.length) return true;
      const text = articleText(a, lang);
      const hay = [text.title, text.summary, ...text.steps, a.keywords, a.text.en.title].join(' ').toLowerCase();
      return tokens.every((tok) => hay.includes(tok));
    });
  }, [q, lang]);

  // Without a search, show the articles grouped by area; with one, show the matches as one list.
  const groups = useMemo(
    () => (q.trim()
      ? [{ area: '', list: articles }]
      : HELP_AREAS.map((area) => ({ area, list: articles.filter((a) => a.area === area) })).filter((g) => g.list.length)),
    [articles, q],
  );

  // Deep link (?a=id): bring the article into view.
  useEffect(() => {
    if (!openId) return;
    const el = document.getElementById(`help-${openId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openId]);

  const toggle = (id: string, expanded: boolean) => {
    const next = new URLSearchParams(params);
    if (expanded) next.set('a', id);
    else next.delete('a');
    setParams(next, { replace: true });
  };

  return (
    <MpShell>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(280px, 1fr)' }, alignItems: 'start' }}>
        <Box>
          <Typography variant="h5" component="h2" gutterBottom>{t('help.title')}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{t('help.subtitle')}</Typography>
          <TextField
            fullWidth
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('help.search')}
            slotProps={{
              htmlInput: { 'aria-label': t('help.search') },
              input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> },
            }}
            sx={{ mb: 2 }}
          />
          {articles.length === 0 && <Typography color="text.secondary">{t('help.noResults', { q })}</Typography>}
          {groups.map((g) => (
            <Box key={g.area || 'results'} component="section" sx={{ mb: 2 }}>
              {g.area && (
                <Typography variant="overline" component="h3" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {t(`helpArea.${g.area}`)}
                </Typography>
              )}
              {g.list.map((a: HelpArticle) => {
                const text = articleText(a, lang);
                return (
                  <Accordion
                    key={a.id}
                    id={`help-${a.id}`}
                    expanded={openId === a.id}
                    onChange={(_, exp) => toggle(a.id, exp)}
                    disableGutters
                    sx={{ scrollMarginTop: 80 }}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />} aria-controls={`help-${a.id}-body`}>
                      <Box>
                        <Typography sx={{ fontWeight: 600 }}>{text.title}</Typography>
                        <Typography variant="body2" color="text.secondary">{text.summary}</Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails id={`help-${a.id}-body`}>
                      <Box component="ol" sx={{ pl: 3, m: 0, '& li': { mb: 1 } }}>
                        {text.steps.map((s, i) => <li key={i}><Typography variant="body2">{s}</Typography></li>)}
                      </Box>
                      {a.path && (
                        <Button component={RouterLink} to={a.path} size="small" sx={{ mt: 1 }}>{t('common.open')}</Button>
                      )}
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" component="h2">{t('help.contact')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('help.contactHint')}</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="contained" startIcon={<Call />} href={`tel:${SUPPORT.phoneE164}`}>
                  {t('help.call')} {SUPPORT.phoneDisplay}
                </Button>
                <Button variant="outlined" startIcon={<Sms />} href={`sms:${SUPPORT.phoneE164}`}>{t('help.text')}</Button>
                <Button variant="outlined" startIcon={<Email />} href={`mailto:${SUPPORT.email}`}>{t('help.email')}</Button>
              </Box>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <PreferencesControls showTitle />
            </CardContent>
          </Card>
          <Button variant="outlined" startIcon={<RocketLaunch />} component={RouterLink} to="/mp/welcome">
            {t('help.restartGuide')}
          </Button>
        </Box>
      </Box>
    </MpShell>
  );
};

export default HelpCenter;

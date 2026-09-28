import React, { useId, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import { HelpOutline } from '@mui/icons-material';
import { useLanguage, useT } from '../../i18n';
import { articleText, findArticle, type HelpArticleId } from './articles';

interface HelpTipProps {
  /** Help article to summarize (see help/articles.ts). */
  article: HelpArticleId;
  size?: 'small' | 'medium';
}

/**
 * Small (?) button: hover shows the article summary, click opens a popover with a link to the full article.
 * Usage: `<HelpTip article="pair-phone" />`.
 */
const HelpTip: React.FC<HelpTipProps> = ({ article, size = 'small' }) => {
  const t = useT();
  const lang = useLanguage();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const popId = useId();
  const a = findArticle(article);
  if (!a) return null;
  const text = articleText(a, lang);

  return (
    <>
      <Tooltip title={text.summary}>
        <IconButton
          size={size}
          aria-label={t('help.tipLabel', { title: text.title })}
          aria-haspopup="dialog"
          aria-controls={anchor ? popId : undefined}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ color: 'text.secondary' }}
        >
          <HelpOutline fontSize={size === 'small' ? 'small' : 'medium'} />
        </IconButton>
      </Tooltip>
      <Popover
        id={popId}
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, maxWidth: 320 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>{text.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{text.summary}</Typography>
          <Button size="small" component={RouterLink} to={`/mp/help?a=${a.id}`} onClick={() => setAnchor(null)}>
            {t('help.readArticle')}
          </Button>
        </Box>
      </Popover>
    </>
  );
};

export default HelpTip;

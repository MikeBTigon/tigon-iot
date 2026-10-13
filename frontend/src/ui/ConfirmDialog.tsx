import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, useMediaQuery, useTheme,
} from '@mui/material';

export interface ConfirmOptions {
  title: string;
  text?: React.ReactNode;
  /** Red confirm button (deleting, removing…). */
  danger?: boolean;
  /** Confirm button label (default "OK", or "Delete" when danger). */
  okLabel?: string;
  cancelLabel?: string;
  /** Only an OK button (replaces window.alert). */
  alertOnly?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Plain browser fallback when no provider is mounted (e.g. in a test). */
const fallback: ConfirmFn = async (o) => {
  const msg = [o.title, typeof o.text === 'string' ? o.text : ''].filter(Boolean).join('\n\n');
  if (o.alertOnly) {
    window.alert(msg);
    return true;
  }
  return window.confirm(msg);
};

/**
 * Promise-based confirm box:
 * `const confirm = useConfirm(); if (!(await confirm({ title: 'Delete this lead?', danger: true }))) return;`
 */
// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useConfirm = (): ConfirmFn => useContext(ConfirmContext) ?? fallback;

/** Mount once near the top of the app (App.tsx). */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setOpts(o);
  }), []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!opts}
        onClose={() => close(false)}
        maxWidth="xs"
        fullWidth
        aria-labelledby="confirm-title"
        slotProps={{ paper: { sx: phone ? { m: 2, width: 'calc(100% - 32px)' } : undefined } }}
      >
        <DialogTitle id="confirm-title">{opts?.title}</DialogTitle>
        {opts?.text && (
          <DialogContent>
            {typeof opts.text === 'string' ? <DialogContentText>{opts.text}</DialogContentText> : opts.text}
          </DialogContent>
        )}
        <DialogActions>
          {!opts?.alertOnly && <Button onClick={() => close(false)}>{opts?.cancelLabel || 'Cancel'}</Button>}
          <Button
            variant="contained"
            color={opts?.danger ? 'error' : 'primary'}
            onClick={() => close(true)}
            autoFocus
          >
            {opts?.okLabel || (opts?.danger ? 'Delete' : 'OK')}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
};

export default ConfirmProvider;

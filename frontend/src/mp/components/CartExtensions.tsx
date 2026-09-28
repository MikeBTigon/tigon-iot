import { Box } from '@mui/material';
import type { MpCart } from '../types';
import CreateCartButtons from '../create/CartButtons';
import ShareCartButtons from '../share/CartButtons';
import CrmCartButtons from '../crm/CartButtons';
import TeamCartButtons from '../team/CartButtons';

/** Extra cart-page actions contributed by each feature area. */
export default function CartExtensions({ cart }: { cart: MpCart }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      <ShareCartButtons cart={cart} />
      <CreateCartButtons cart={cart} />
      <CrmCartButtons cart={cart} />
      <TeamCartButtons cart={cart} />
    </Box>
  );
}

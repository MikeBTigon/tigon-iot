// Imported FIRST by index.ts: options for every v2 function defined after it. Public HTTP endpoints raise their own
// maxInstances to 20; everything else is capped at 10 (a runaway loop or traffic spike can't run up the bill).
import {setGlobalOptions} from 'firebase-functions/v2';

setGlobalOptions({maxInstances: 10});

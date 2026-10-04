import { db } from '../src/lib/db/client';
import { deliverOutbox } from '../src/lib/analytics/server';
// Run only after deployment approval and Measurement Protocol validation.
deliverOutbox(db).then(result=>console.log(result)).finally(()=>(db as any).$disconnect());

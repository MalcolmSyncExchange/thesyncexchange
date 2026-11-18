import {database} from './helpers/artist-baseline-db.mjs';
import {register} from './helpers/final-alpha-cases.mjs';
register(async run=>{const db=await database();try{await run(db);}finally{await db.close();}},'Phase15A PGlite');

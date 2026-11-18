import pg from 'pg';
import {fixture,mediaTestSocket,mediaTestPort} from './helpers/submission-media-postgres.mjs';
import {register} from './helpers/final-alpha-cases.mjs';
register(async run=>{const base=await fixture(),client=new pg.Client({host:mediaTestSocket,port:mediaTestPort,user:'slice3_fixture_admin',database:base.name});try{await client.connect();await client.query("set request.jwt.claim.role='service_role'");await run({query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql)});}finally{await client.end();await base.close();}},'Phase15A native PostgreSQL');

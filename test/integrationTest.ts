import express from 'express';
import http from 'http';
import * as path from 'path';
import { makeFetch } from 'supertest-fetch';

import * as exegesisExpress from '../src';

async function sessionAuthSecurityPlugin(
    context: exegesisExpress.ExegesisPluginContext
) : Promise<exegesisExpress.ExegesisAuthenticated | undefined> {
    const session = context.req.headers.session;
    if(!session || typeof(session) !== 'string') {
        return undefined;
    }
    if(session !== 'secret') {
        throw context.makeError(403, "Invalid session.");
    }
    return {
        user: {name: 'jwalton'},
        roles: ['readWrite', 'admin']
    };
}

async function createServer() {
    const options : exegesisExpress.ExegesisOptions = {
        controllers: path.resolve(__dirname, './integrationSample/controllers'),
        securityPlugins: {
            sessionKey: sessionAuthSecurityPlugin
        },
        controllersPattern: "**/*.@(ts|js)"
    };

    const exegesisMiddleware = await exegesisExpress.middleware(
        path.resolve(__dirname, './integrationSample/openapi.yaml'),
        options
    );

    const app = express();
    app.use(exegesisMiddleware);
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if(err) {
            res.writeHead(500);
            res.end(`Internal error: ${err.message}`);
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    return http.createServer(app);
}

describe('integration', function() {
    beforeEach(async function() {
        this.server = await createServer();
    });

    afterEach(function() {
        if(this.server) {this.server.close();}
    });

    it('should succesfully call an API', async function() {
        const fetch = makeFetch(this.server);
        await fetch(`/greet?name=Jason`)
            .expect(200)
            .expect('content-type', 'application/json')
            .expectBody({greeting: 'Hello, Jason!'});
    });

    it('should return an error for missing parameters', async function() {
        const fetch = makeFetch(this.server);
        await fetch(`/greet`)
            .expect(400)
            .expect('content-type', 'application/json')
            .expectBody({
                "message": "Validation errors",
                "errors": [{
                    "type": "error",
                    "message": "Missing required query parameter \"name\"",
                    "location": {
                        "docPath": ["paths", "/greet", "get", "parameters", "0"],
                        "in": "query",
                        "name": "name",
                        "path": []
                     },
                   }
                 ]
            });
    });

    it('should require authentication from a security plugin', async function() {
        const fetch = makeFetch(this.server);
        await fetch(`/secure`)
            .expect(403)
            .expectBody({message:"Must authenticate using one of the following schemes: sessionKey."});
    });

    it('should return an error from a security plugin', async function() {
        const fetch = makeFetch(this.server);
        await fetch(`/secure`, {
            headers: {session: 'wrong'}
        })
            .expect(403)
            .expectBody({message: "Invalid session."});
    });

    it('should require authentication from a security plugin', async function() {
        const fetch = makeFetch(this.server);
        await fetch(`/secure`, {
            headers: {session: 'secret'}
        })
            .expect(200)
            .expectBody({
                sessionKey: {
                    user: {name: 'jwalton'},
                    roles: ['readWrite', 'admin']
                }
            });
    });

});
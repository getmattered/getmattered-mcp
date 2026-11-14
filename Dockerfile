# GetMattered MCP server, packaged as a stdio bridge to the hosted remote server.
#
# The product runs on Cloudflare Workers at https://mcp.getmattered.com/mcp. This
# image starts a local stdio process that relays the MCP protocol to it, so any
# client or sandbox that can only launch a command still reaches every tool.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist

# No key or token. The server starts and answers initialize and tools/list with
# no sign-in. Tool calls need the user's GetMattered account, connected once
# through the browser sign-in (OAuth): `getmattered-mcp login`.

ENTRYPOINT ["node", "dist/index.js"]

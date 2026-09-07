# AI Applyd MCP server, packaged as a stdio bridge to the hosted remote server.
#
# The product runs on Cloudflare Workers at https://mcp.aiapplyd.com/mcp. This
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

# Optional. Without it the server still starts and answers introspection
# (initialize, tools/list, prompts/list, resources/list); tool CALLS return 401
# until the user connects an AI Applyd account.
ENV AIAPPLYD_TOKEN=""

ENTRYPOINT ["node", "dist/index.js"]

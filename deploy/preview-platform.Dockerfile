# Temporary sample-data preview. Reuse a verified existing runtime image.
ARG PREVIEW_BASE
FROM ${PREVIEW_BASE}
WORKDIR /app
COPY --chown=node:node dist ./dist
COPY --chown=node:node src ./src
COPY --chown=node:node frontend/src/app/demo-fixture.ts ./frontend/src/app/demo-fixture.ts
COPY --chown=node:node scripts/preview-platform.mjs ./scripts/preview-platform.mjs
ENV PLATFORM_PREVIEW_HOST=0.0.0.0 PLATFORM_PREVIEW_PORT=5178
USER node
EXPOSE 5178
CMD ["node","scripts/preview-platform.mjs"]

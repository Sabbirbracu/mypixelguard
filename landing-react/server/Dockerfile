# Visitor counter. Mount a persistent volume at /data or the count resets when the container is replaced.
FROM node:22-alpine
WORKDIR /app
COPY visitor-counter.mjs .
ENV PORT=8787 DATA_FILE=/data/visitors.json TRUST_PROXY=1
VOLUME /data
EXPOSE 8787
CMD ["node", "visitor-counter.mjs"]

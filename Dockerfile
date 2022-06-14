# This is just to have dummy builds for self-testing
FROM nginx:latest AS server
ARG COMMIT
RUN echo $COMMIT > /usr/share/nginx/html/index.html

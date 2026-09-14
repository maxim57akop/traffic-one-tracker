FROM golang:1.24-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /bin/trafficone ./cmd/server

FROM alpine:3.22

WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=build /bin/trafficone /bin/trafficone
COPY schema.sql ./schema.sql

EXPOSE 8080
CMD ["/bin/trafficone"]

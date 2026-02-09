#!/bin/sh

# Start nginx in the background
nginx -g "daemon off;" &
NGINX_PID=$!

# Wait for nginx to be ready (using curl for proper HTTP health check)
echo "Starting Daylo..."
for i in $(seq 1 30); do
  if curl -f -s http://localhost/ > /dev/null 2>&1; then
    echo ""
    echo "  ✅ Daylo is ready!"
    echo "  👉 Open http://localhost:3000 in your browser"
    echo ""
    break
  fi
  sleep 1
done

# Keep the container running
wait $NGINX_PID

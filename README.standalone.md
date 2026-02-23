# VibeTmux Standalone Server

Run VibeTmux as a standalone web terminal server without the macOS app. Perfect for remote machines, Docker containers, and quick terminal sharing.

## Quick Start

### Using npx (no installation)

```bash
# Run with no authentication (demo/testing)
npx vibetmux --no-auth

# Run with ngrok tunnel for instant sharing
npx vibetmux --no-auth --ngrok

# Run with Cloudflare tunnel (no auth needed)
npx vibetmux --no-auth --cloudflare

# Run with Tailscale tunnel
npx vibetmux --no-auth --enable-tailscale-serve

# Run with custom port
npx vibetmux --port 8080 --no-auth
```

### Global Installation

```bash
# Install globally
npm install -g vibetmux

# Run the server
vibetmux --no-auth
```

### Docker

```bash
# Build the image
docker build -f Dockerfile.standalone -t vibetmux .

# Mount your code and run with ngrok tunnel
docker run -v $(pwd):/workspace -p 4020:4020 vibetmux --ngrok

# With Cloudflare tunnel (no auth needed)
docker run -v $(pwd):/workspace -p 4020:4020 vibetmux --cloudflare

# Local development (no tunnel)
docker run -v $(pwd):/workspace -p 4020:4020 vibetmux --no-auth

# With ngrok auth token for custom domain
docker run -v $(pwd):/workspace -p 4020:4020 vibetmux --ngrok --ngrok-auth YOUR_TOKEN
```

## CLI Options

### Basic Server Options

- `--port <number>` - Server port (default: 4020)
- `--bind <address>` - Bind address (default: 0.0.0.0)
- `--no-auth` - Disable authentication (for testing)
- `--debug` - Enable debug logging

### Tunnel Options (for remote access)

- `--ngrok` - Enable ngrok tunnel for instant sharing
- `--ngrok-auth <token>` - Ngrok authentication token  
- `--ngrok-domain <domain>` - Custom ngrok domain (paid plan)
- `--ngrok-region <region>` - Ngrok region (us, eu, ap, au, sa, jp, in)
- `--cloudflare` - Enable Cloudflare tunnel (Quick Tunnel, no auth)
- `--enable-tailscale-serve` - Enable Tailscale Serve integration

### Authentication Options

- `--enable-ssh-keys` - Enable SSH key authentication
- `--disallow-user-password` - Disable password auth, SSH keys only
- `--allow-local-bypass` - Allow localhost connections to bypass auth
- `--local-auth-token <token>` - Token for localhost auth bypass

### Network Discovery

- `--no-mdns` - Disable mDNS/Bonjour advertisement

## Use Cases

### Remote Server Access

Access a remote server's terminal through a web browser:

```bash
# Method 1: Built-in ngrok (easiest!)
npx vibetmux --no-auth --ngrok
# Output: Public URL: https://abc123.ngrok.io

# Method 2: Built-in Cloudflare (no auth needed)
npx vibetmux --no-auth --cloudflare  
# Output: Public URL: https://random-words.trycloudflare.com

# Method 3: With Tailscale (if configured)
npx vibetmux --no-auth --enable-tailscale-serve

# Method 4: With ngrok auth for custom domain
npx vibetmux --no-auth --ngrok --ngrok-auth YOUR_TOKEN --ngrok-domain custom.ngrok.io
```

### Docker Development Environment

Mount your project and get instant web terminal access:

```bash
# Quick development container with tunnel
docker run -v $(pwd):/workspace -p 4020:4020 vibetmux --ngrok

# Or for team development
docker run -v /path/to/project:/workspace -p 4020:4020 vibetmux --cloudflare

# Your code is available at /workspace in the web terminal
# Access via the tunnel URL from anywhere
```

### Quick Terminal Sharing

Share your terminal session in one command:

```bash
# Instant sharing with ngrok
npx vibetmux --no-auth --ngrok

# Or with Cloudflare (no signup needed)
npx vibetmux --no-auth --cloudflare

# With Tailscale (if configured)
npx vibetmux --no-auth --enable-tailscale-serve
```

### Kubernetes Pod Access

Deploy VibeTmux as a sidecar container for web-based pod access:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-terminal
spec:
  containers:
  - name: main-app
    image: your-app:latest
  - name: vibetmux
    image: vibetmux:latest
    ports:
    - containerPort: 4020
    env:
    - name: VIBETMUX_NO_AUTH
      value: "true"
```

## Security Considerations

⚠️ **Warning**: The `--no-auth` flag disables all authentication. Only use this for:
- Local development
- Isolated Docker containers
- Networks you fully trust

For production use:
1. Always enable authentication
2. Use HTTPS/TLS (via ngrok or reverse proxy)
3. Consider SSH key authentication with `--enable-ssh-keys`
4. Use environment variables for sensitive configuration

## Environment Variables

- `PORT` - Default port if --port not specified
- `VIBETMUX_DEBUG` - Enable debug logging
- `VIBETMUX_CONTROL_DIR` - Control directory for session data
- `NGROK_AUTHTOKEN` - Ngrok auth token (alternative to --ngrok-auth)

## Building from Source

```bash
# Clone the repository
git clone https://github.com/amantus-ai/vibetmux.git
cd vibetmux/web

# Install dependencies
pnpm install

# Build
pnpm run build

# Run
node dist/cli.js --no-auth
```

## Differences from Mac App Version

The standalone server:
- ✅ Runs on any platform (Linux, macOS, Windows via WSL)
- ✅ Works in Docker containers
- ✅ Can be deployed via npx without installation
- ✅ Includes built-in ngrok support
- ❌ No menu bar integration
- ❌ No automatic server management
- ❌ No macOS-specific features (Keychain, etc.)

## Troubleshooting

### Ngrok not starting

- Ensure ngrok is installed: `which ngrok`
- Check if you need an auth token for your use case
- Verify the port is not already in use

### Permission denied errors

- The server needs to spawn PTY processes
- In Docker, you may need `--cap-add SYS_ADMIN`
- Check file permissions in mounted volumes

### Connection refused

- Verify the bind address (use 0.0.0.0 for all interfaces)
- Check firewall rules
- Ensure the port is exposed in Docker

## License

MIT - See LICENSE file for details
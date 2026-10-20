# No-monthly-plan hosting on Oracle Cloud Always Free

This option runs YamaConvert's existing downloader on an always-on Linux VM in
Oracle Cloud, so neither the user's Windows PC nor a paid Railway plan is
needed. The downloader already uses Node, Python, yt-dlp and FFmpeg; the Docker
base image supports Oracle's ARM Ampere A1 machines.

Oracle documents an Always Free allowance of up to 2 Ampere A1 OCPUs and 12 GB
of memory per tenancy, plus 10 TB/month of outbound data transfer. Capacity for
free VMs depends on region availability. Create only resources explicitly marked
Always Free eligible; this setup does not require an Oracle paid plan.

## One-time cloud setup

1. Create an Oracle Cloud account and select an Always Free eligible home region
   with Ampere A1 capacity. Create an Oracle Linux 9 ARM64 VM using only the
   Always Free `VM.Standard.A1.Flex` shape, and assign a public IP.
2. In the VM's network security list, allow inbound TCP ports 80 and 443. Do not
   expose port 3000; Docker keeps it private to the compose network.
3. Add a DNS `A` record for `downloads.yamachat.eu` pointing to the VM's public
   IP. Keep this DNS record DNS-only so Caddy can issue a normal HTTPS
   certificate and large downloads stream directly to the browser.
4. On Oracle Linux 9, install Podman and Compose from Oracle's repositories:
   `sudo dnf install -y container-tools oracle-epel-release-el9`,
   `sudo dnf config-manager --enable ol9_developer_EPEL`, then
   `sudo dnf install -y podman-compose`. Copy this downloader directory to the
   VM, then copy `.env.example` to `.env` and set:
   `DOWNLOAD_HOST`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
   `ALLOWED_ORIGINS=https://yamachat.eu`.
5. Start the service with `sudo podman-compose up -d --build`. Check that
   `https://downloads.yamachat.eu/api/status` reports `socialDownloads: true`.
6. Set the same HTTPS API address in the Yamaportal Pages build configuration
   as the GitHub Actions repository variable `YAMACONVERT_DOWNLOADER_URL`, then
   publish the web/PWA update. The Pages build injects this address into the
   PWA; both the website and installed PWA will use the same server.

## Cost and limits

The VM, storage and data transfer must remain within Oracle's Always Free
allowances. The documented outbound allowance is 10 TB/month. Oracle may have
no free Ampere capacity in a chosen region; in that case, do not select a paid
shape. Stop and remove any resource that the console does not mark Always Free.
This downloader is intentionally capped at 10 jobs per signed-in account per
day, 2 concurrent jobs, 100 MB per file and 10 minutes per job.

Oracle may reclaim an Always Free VM if it remains below the provider's idle
usage thresholds for seven days. That means this option costs nothing within
the stated allowance, but does not provide an uptime guarantee.

This service only handles public posts that the signed-in user is entitled to
download or use. It does not use platform login cookies or bypass private,
paid, or DRM-protected content.

# Free Host Setup

Checked 19 October 2026. These are manual preparation steps, not an executed
deployment or a guarantee of production availability. Keep Neon Free for the
database and private object storage; do not copy credentials into chat.

## Before Signing Up

Oracle Always Free is a possible compute host. Its signup requires card identity
verification and can place a temporary authorization hold. There is no Free Tier
uptime SLA. Do not proceed if card verification is unacceptable, and do not
upgrade to Pay As You Go. See the [official Free Tier FAQ](https://www.oracle.com/cloud/free/faq/).

Current A1 allowance is 1,500 OCPU-hours and 9,000 GB-hours monthly, equivalent
to 2 OCPUs and 12 GB continuously. Use the home region; shared existing usage
counts. Free capacity may be unavailable and idle instances may be reclaimed.
See [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## Prepare One Server

1. Open [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/), create your
   own account, and enable MFA. Choose your home region carefully. Use only
   Always Free resources, not resources whose only funding is expiring trial credit.
2. In the console, create a compartment named `understood-test`. Follow Oracle's
   [Linux instance tutorial](https://docs.oracle.com/en-us/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm)
   to create its VCN and public subnet.
3. Open **Compute > Instances > Create Instance**. Name it `understood-test`.
   Choose a no-license-cost, Always Free-eligible Ubuntu image and the
   `VM.Standard.A1.Flex` shape. A proposed starting size is 2 OCPUs, 6 GB RAM,
   and a 50 GB boot disk. Check your account's remaining free allowance and
   the complete cost estimate before creating anything; stop on any charge
   or paid-only option. Do not add load balancers or extra disks for this test.
4. Generate/save the SSH key pair privately, or supply your own public key.
   Never share the private key. In the network rules, restrict inbound SSH
   (TCP 22) to your own public IP address, normally `/32` for IPv4. Leave
   application and database ports closed to the public internet for now.
5. Create the instance only after reviewing eligibility. If capacity is
   unavailable, stop or retry an eligible availability domain in the same
   home region later. Do not upgrade to obtain capacity.
6. When it is running, use PowerShell to connect, substituting your private
   key path and server address:

   ```powershell
   ssh -i "C:\path\to\your-private.key" ubuntu@YOUR_SERVER_IP
   ```

   Check the server host-key fingerprint through a trusted console channel
   before accepting it. Do not ignore a changed-host-key warning.
7. Stop here and report only **server ready**, the OS/architecture, and region.
   Keep the address, credentials and key private. Do not upload `.env`, worker
   data, the database or this application yet.

If signup/capacity prevents this path, an existing machine under your control
can support synthetic local staging while development continues. That is not
proof of reliable public hosting. We will not substitute a paid host silently.

## Later Acceptance

Separate API, worker and private operator identities, ARM/Linux dependency
checks, HTTPS/proxy configuration, private Neon connections, monitoring,
backup/restore and bounded synthetic hosted tests still need implementation
or execution on the actual host. Opening public ingress or connecting/deploying
requires explicit authorization. No real worker data may enter Gemini Free.

Render Free is not a replacement for this always-on worker: its free service
types exclude background workers and its documentation advises against
production use. See [Render Free](https://render.com/docs/free).

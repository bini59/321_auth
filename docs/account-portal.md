# Central account portal

`https://auth.bini59.dev/client` is the user-facing account portal. It shows the
global account name, email, avatar, and linked Google/Kakao identities.

Profile avatars are intentionally public and are served by the existing static
origin:

```text
https://static.bini59.dev/img/profile/<user-uuid>-<version>.png
```

The auth Compose project writes to `/var/lib/321-auth/profile`, which is backed
by `/home/ubuntu/logos/profile` on the production host. The logos Compose
project mounts that same host directory read-only at
`/usr/share/nginx/html/img/profile`. Keep the directory present and
traversable (`755`) and generated files readable (`644`).

The API validates and decodes uploads with Sharp, writes a normalized PNG using
an atomic rename, and removes the avatar during account deletion. Profile
images are public by design; private avatars must use a different storage and
delivery contract.

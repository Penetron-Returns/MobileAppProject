# catalog

Owner configuration behind `/v1`: business details and operating hours, services, staff, staff availability and overrides, and the `/me` payload. Every function takes the caller's business id and verifies that referenced rows belong to it. Database triggers audit the writes.

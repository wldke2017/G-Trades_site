import { defineConfig } from '@prisma/config';

export default defineConfig({
    earlyAccess: true,
    datasources: [
        {
            provider: 'sqlite',
            url: 'file:./dev.db',
        },
    ],
});

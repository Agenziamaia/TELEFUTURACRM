This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 🔒 SICUREZZA — leggere PRIMA di toccare route, tabelle o segreti

Dal 28/08/2026 il CRM è blindato: il database non è più leggibile da estranei e
ognuno vede solo ciò che gli spetta. **Le regole stanno in [`docs/SICUREZZA.md`](docs/SICUREZZA.md)**:

1. ogni funzione in `src/app/api/**` chiede la sessione (`richiedeSessione`);
2. l'identità si prende dalla sessione (`_s.id`), MAI da quello che manda il browser;
3. `supabaseAdmin` (chiave amministratore) non entra mai in una schermata;
4. ogni tabella nuova nasce con la sua regola (RLS); i segreti si chiudono del tutto;
5. i segreti non diventano mai variabili `NEXT_PUBLIC_`.

`npm run sicurezza` controlla le regole 1-2-3-5 e **gira da solo prima di ogni
build**: se una viene violata, la build fallisce e il deploy non parte.

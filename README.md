# Tulos App

Tulos is a modern web application built using [Next.js](https://nextjs.org), [Tailwind CSS](https://tailwindcss.com), [Stripe](https://stripe.com), and other powerful technologies. This app is designed for seamless performance, user-friendly interfaces, and secure payment processing.

You can check the live demo of the app here: [Tulos Demo](https://tulos.reactbd.com/).

## Getting Started

Follow these steps to set up the project and run it locally.

### Prerequisites

Make sure you have the following installed on your system:

- [Node.js](https://nodejs.org) (version 18 or above recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/) or [pnpm](https://pnpm.io/) or [bun](https://bun.sh/)

### Installation

1 . Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

### Environment Variables

To run the app locally, you need to set up the required environment variables. Create a `.env.local` file in the root of your project and add the following credentials:

#### General Configuration

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

#### Backend Setup: Sanity CMS

Tulos uses [Sanity.io](https://www.sanity.io/) for managing content. Follow the [Next.js guide for Sanity](https://www.npmjs.com/package/next-sanity) to get started. Once your Sanity project is ready, add the following variables:

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=
NEXT_PUBLIC_SANITY_DATASET=
NEXT_PUBLIC_SANITY_API_VERSION=
SANITY_API_TOKEN=
SANITY_API_READ_TOKEN=
```

#### Authentication: Clerk

For user authentication, Tulos integrates with [Clerk](https://clerk.com/). Sign up on Clerk and set up your project. Add the following keys:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

#### Payment: Stripe

Stripe is used for secure payment processing. Sign up on [Stripe](https://stripe.com/) and add the following keys:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

To generate the `STRIPE_WEBHOOK_SECRET`, install the Stripe CLI and run:

```bash
stripe listen --forward-to localhost:3000/api/webhook
```

#### Chat Integration: Sendbird

For real-time chat functionality, Tulos uses [Sendbird](https://sendbird.com/). Create a Sendbird project and add the following:

```env
SENDBIRD_APP_ID=
```

### Running the App

1. Start the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   # or
   bun dev
   ```

2. Open [http://localhost:3000](http://localhost:3000) in your browser to see the app in action.

You can start editing the application by modifying files in the `app/` directory. The app supports hot reloading, so your changes will reflect instantly.

## Deployment

The easiest way to deploy your app is via [Vercel](https://vercel.com). Follow these steps to deploy:

1. Push your code to a GitHub, GitLab, or Bitbucket repository.
2. Sign up or log in to [Vercel](https://vercel.com/).
3. Connect your repository and follow the deployment instructions.

For detailed instructions, check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying).

## Learn More

To explore more about the technologies used in this project:

- [Next.js Documentation](https://nextjs.org/docs) – learn about features and API.
- [Tailwind CSS Documentation](https://tailwindcss.com/docs) – customize your design.
- [Sanity Documentation](https://www.sanity.io/docs) – manage your backend content.
- [Stripe Documentation](https://stripe.com/docs) – integrate secure payments.
- [Clerk Documentation](https://clerk.com/docs) – add authentication to your app.
- [Sendbird Documentation](https://sendbird.com/docs) – build real-time chat features.

We’re excited to see what you build with Tulos!

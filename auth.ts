import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

console.log("DEBUG AUTH ENV:", process.env.AUTH_GOOGLE_ID, process.env.AUTH_SECRET);

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: "https://accounts.google.com/o/oauth2/v2/auth?prompt=consent&access_type=offline&response_type=code&scope=openid%20email%20profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file",
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Persist the OAuth access_token and refresh_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client, like an access_token from a provider.
      if (token?.accessToken) {
        // @ts-ignore
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
  },
});

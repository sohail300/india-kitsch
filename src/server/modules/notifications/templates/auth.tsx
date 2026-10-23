import { Button, Heading, Muted, renderEmail } from "./shared";
import type { RenderedEmail } from "./shared";

export type { RenderedEmail };

export async function verifyEmailTemplate(name: string, url: string): Promise<RenderedEmail> {
  return renderEmail(
    "Verify your email - India Kitsch",
    <>
      <Heading>Almost there, {name}!</Heading>
      <p style={{ margin: "0 0 8px" }}>
        Confirm your email address to finish setting up your account.
      </p>
      <Button href={url}>Verify email</Button>
      <Muted>
        Or paste this link into your browser:{" "}
        <a href={url} style={{ wordBreak: "break-all" }}>
          {url}
        </a>
      </Muted>
    </>,
  );
}

export async function resetPasswordTemplate(name: string, url: string): Promise<RenderedEmail> {
  return renderEmail(
    "Reset your India Kitsch password",
    <>
      <Heading>Hi {name},</Heading>
      <p style={{ margin: "0 0 8px" }}>We received a request to reset your password.</p>
      <Button href={url}>Reset password</Button>
      <Muted>
        If you didn&apos;t request this, you can ignore this email - your password won&apos;t
        change.
      </Muted>
    </>,
  );
}

"use client";

import { ConfirmActionButton } from "@/app/admin/_components/confirm-action-button";
import { setCustomerDisabledAction } from "../actions";

/** Disabling and re-enabling both ask first - same as the coupon Active switch. */
export function CustomerDisableButton({
  customerId,
  disabled,
  customerName,
}: {
  customerId: string;
  disabled: boolean;
  customerName: string;
}) {
  if (disabled) {
    return (
      <ConfirmActionButton
        label="Re-enable account"
        title={`Re-enable ${customerName}'s account?`}
        description="They'll be able to sign in and place orders again."
        confirmLabel="Re-enable account"
        successMessage="Account re-enabled"
        action={() => setCustomerDisabledAction(customerId, false)}
      />
    );
  }

  return (
    <ConfirmActionButton
      label="Disable account"
      title={`Disable ${customerName}'s account?`}
      description="They'll be signed out everywhere and won't be able to sign in until you re-enable it. Existing orders are unaffected."
      confirmLabel="Disable account"
      variant="destructive"
      successMessage="Account disabled"
      action={() => setCustomerDisabledAction(customerId, true)}
    />
  );
}

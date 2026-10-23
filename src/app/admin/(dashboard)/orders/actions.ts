"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import {
  cancelPaidOrder,
  markOrderDelivered,
  markOrderProcessing,
  markOrderShipped,
  refundOrder,
  setOrderNote,
  type CancelPaidOrderInput,
  type MarkOrderShippedInput,
  type RefundOrderInput,
} from "@/server/modules/orders/admin";
import type { Order } from "@/server/modules/orders/stateMachine";
import { actionError, type ActionResult } from "@/app/admin/_lib/action-result";

function afterMutation(orderId: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function markOrderProcessingAction(orderId: string): Promise<ActionResult<Order>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await markOrderProcessing(orderId, session.user.id);
    afterMutation(orderId);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function markOrderShippedAction(
  input: MarkOrderShippedInput,
): Promise<ActionResult<Order>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await markOrderShipped(input, session.user.id);
    afterMutation(input.orderId);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function markOrderDeliveredAction(orderId: string): Promise<ActionResult<Order>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await markOrderDelivered(orderId, session.user.id);
    afterMutation(orderId);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function setOrderNoteAction(
  orderId: string,
  note: string,
): Promise<ActionResult<Order>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await setOrderNote(orderId, note, session.user.id);
    afterMutation(orderId);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function refundOrderAction(
  input: RefundOrderInput,
): Promise<ActionResult<{ order: Order; refundId: string }>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await refundOrder(input, session.user.id);
    afterMutation(input.orderId);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelPaidOrderAction(
  input: CancelPaidOrderInput,
): Promise<ActionResult<Order>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await cancelPaidOrder(input, session.user.id);
    afterMutation(input.orderId);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

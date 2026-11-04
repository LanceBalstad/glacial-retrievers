import { useState } from "react";
import { createEvent, type CreateEventPayload } from "./api";

export type RequestStatus = "idle" | "submitting" | "success" | "error";

interface SubmitMessages {
  success: string;
  error: string;
}

const useEventRequest = () => {
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [message, setMessage] = useState("");

  const fail = (errorMessage: string) => {
    setStatus("error");
    setMessage(errorMessage);
  };

  // Resolves true when the event was created so callers can reset their form.
  const submit = async (
    payload: CreateEventPayload,
    messages: SubmitMessages,
  ): Promise<boolean> => {
    setStatus("submitting");
    setMessage("");

    try {
      await createEvent(payload, messages.error);
      setStatus("success");
      setMessage(messages.success);
      return true;
    } catch (error) {
      fail(error instanceof Error ? error.message : messages.error);
      return false;
    }
  };

  return { status, message, submit, fail };
};

export default useEventRequest;

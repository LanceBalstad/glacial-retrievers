import { type RequestStatus } from "../../lib/useEventRequest";
import "./formSubmit.css";

interface FormSubmitProps {
  label: string;
  submittingLabel?: string;
  status: RequestStatus;
  message: string;
}

const FormSubmit = ({
  label,
  submittingLabel = "Submitting...",
  status,
  message,
}: FormSubmitProps) => (
  <>
    <button type="submit" className="form-submit" disabled={status === "submitting"}>
      {status === "submitting" ? submittingLabel : label}
    </button>

    {message ? (
      <p className={`form-status ${status}`} role="status">
        {message}
      </p>
    ) : null}
  </>
);

export default FormSubmit;

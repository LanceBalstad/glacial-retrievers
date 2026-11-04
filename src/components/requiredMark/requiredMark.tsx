import "./requiredMark.css";

// Visual asterisk for required fields; the input's `required` attribute is what
// screen readers announce, so the mark itself is hidden from them.
const RequiredMark = () => (
  <span className="required-mark" aria-hidden="true">
    *
  </span>
);

export default RequiredMark;

import { type ChangeEvent } from "react";
import RequiredMark from "../requiredMark/requiredMark.tsx";

export interface OwnerContactValues {
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
}

export const emptyOwnerContact: OwnerContactValues = {
  ownerFirstName: "",
  ownerLastName: "",
  ownerEmail: "",
  ownerPhone: "",
};

interface OwnerContactFieldsProps {
  values: OwnerContactValues;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

// Styled by the surrounding .modal-form (see components/modal/modal.css).
const OwnerContactFields = ({ values, onChange }: OwnerContactFieldsProps) => (
  <>
    <div className="modal-field-row">
      <label>
        <span>
          First name
          <RequiredMark />
        </span>
        <input
          type="text"
          name="ownerFirstName"
          value={values.ownerFirstName}
          onChange={onChange}
          placeholder="Your first name"
          required
        />
      </label>

      <label>
        <span>
          Last name
          <RequiredMark />
        </span>
        <input
          type="text"
          name="ownerLastName"
          value={values.ownerLastName}
          onChange={onChange}
          placeholder="Your last name"
          required
        />
      </label>
    </div>

    <div className="modal-field-row">
      <label>
        <span>
          Email
          <RequiredMark />
        </span>
        <input
          type="email"
          name="ownerEmail"
          value={values.ownerEmail}
          onChange={onChange}
          placeholder="you@example.com"
          required
        />
      </label>

      <label>
        Phone number
        <input
          type="tel"
          name="ownerPhone"
          value={values.ownerPhone}
          onChange={onChange}
          placeholder="(555) 123-4567"
        />
      </label>
    </div>
  </>
);

export default OwnerContactFields;

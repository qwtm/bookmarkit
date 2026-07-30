import React from "react";
import { Banner, Button, Modal } from "./DesignSystem.jsx";

// A11Y-04, PERF-05: live region announcement and React.memo. Focus trap, Escape,
// and focus restoration come from Modal (#27).
const MessageModal = ({ message, type = "info", onClose }) => {
  return (
    <Modal
      title={type === "success" ? "Success!" : type === "error" ? "Error!" : "Information"}
      titleId="message-modal-title"
      size="sm"
      onClose={onClose}
      footer={
        <Button intent="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <Banner tone={type === "error" ? "error" : type}>{message}</Banner>
    </Modal>
  );
};

export default React.memo(MessageModal);

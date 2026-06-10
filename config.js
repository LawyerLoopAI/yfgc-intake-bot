// Only file that changes when onboarding a new client.
// Each entry needs senderEmail and driveFolderId.
//
// - id:            internal short slug, only used in logs
// - senderEmail:   the From: address the bot will watch for
// - driveFolderId: Google Drive folder ID where intake subfolders are created
// - clientName:    human display name (passed to Claude for context)
// - matterType:    freeform description of the engagement (passed to Claude)

const clients = [
  {
    id: "12zero",
    senderEmail: "roger@12zeros.vc",
    driveFolderId: "1rLyJjCKybeLruiV2jihZg2aEJEMHAR7e",
    clientName: "12 Zero",
    matterType: "venture / general counsel",
  },
];

module.exports = clients;

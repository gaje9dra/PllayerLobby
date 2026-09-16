export {};

declare global {
  var recordAdminAuditEvent: (input: {
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
}

export function FeatureDisabledNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold text-foreground">Grid Pipeline unavailable</h1>
        <p className="text-sm">
          This workspace does not have the Grid Pipeline entitlement. That grant
          is managed server-side and cannot be turned on from organization
          settings.
        </p>
      </div>
    </div>
  );
}

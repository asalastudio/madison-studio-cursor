export function FeatureDisabledNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold text-foreground">Grid Pipeline unavailable</h1>
        <p className="text-sm">
          This workspace does not have the Grid Pipeline feature enabled. Ask an
          admin to flip{" "}
          <code className="text-xs bg-card px-1 py-0.5 rounded border border-border">
            brand_config.features.grid_pipeline
          </code>{" "}
          to{" "}
          <code className="text-xs bg-card px-1 py-0.5 rounded border border-border">true</code>{" "}
          on the organization.
        </p>
      </div>
    </div>
  );
}

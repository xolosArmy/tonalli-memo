interface MetadataItem {
  readonly label: string;
  readonly value: React.ReactNode;
}

export function MetadataList({ items }: { readonly items: readonly MetadataItem[] }): React.JSX.Element {
  return (
    <dl className="metadata-list">
      {items.map((item) => (
        <div className="metadata-list__row" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

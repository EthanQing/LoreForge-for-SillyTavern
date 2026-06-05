import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { ChangeEvent, useRef } from "react";
import { useCardStore } from "../../app/store";
import { Button } from "../../components/Button";
import { SelectField, TextField } from "../../components/Field";

function extensionFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase().replace(/^\./, "");
  return ext && ext !== name ? ext : "unknown";
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AssetsPanel() {
  const assets = useCardStore((state) => state.card.data.assets ?? []);
  const updateData = useCardStore((state) => state.updateData);
  const inputRef = useRef<HTMLInputElement>(null);

  const addAsset = (asset = { type: "icon", uri: "ccdefault:", name: assets.some((item) => item.type === "icon") ? "icon" : "main", ext: "png" }) => {
    updateData("assets", [...assets, asset]);
  };

  const addImageAsset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const type = assets.some((asset) => asset.type === "icon") ? "other" : "icon";
    const name = type === "icon" ? "main" : file.name.replace(/\.[^.]+$/, "") || "asset";
    addAsset({ type, uri: await readDataUrl(file), name, ext: extensionFromName(file.name) });
    event.target.value = "";
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Assets</h2>
        <div className="inline-row compact">
          <input ref={inputRef} className="hidden-file" type="file" accept="image/*" onChange={addImageAsset} />
          <Button icon={<ImagePlus size={16} />} onClick={() => inputRef.current?.click()}>
            Image
          </Button>
          <Button icon={<Plus size={16} />} variant="primary" onClick={() => addAsset()}>
            Asset
          </Button>
        </div>
      </div>
      {assets.length === 0 ? <p className="muted">No assets</p> : null}
      <div className="asset-grid">
        {assets.map((asset, index) => (
          <article className="asset-card" key={`${asset.type}-${asset.name}-${index}`}>
            <div className="asset-preview">
              {asset.uri.startsWith("data:image/") ? <img alt={asset.name} src={asset.uri} /> : <span>{asset.type}</span>}
            </div>
            <div className="asset-fields">
              <SelectField
                label="Type"
                value={asset.type}
                onChange={(event) => updateData("assets", assets.map((item, itemIndex) => (itemIndex === index ? { ...item, type: event.target.value } : item)))}
              >
                <option value="icon">icon</option>
                <option value="background">background</option>
                <option value="user_icon">user_icon</option>
                <option value="emotion">emotion</option>
                <option value="other">other</option>
              </SelectField>
              <TextField
                label="Name"
                value={asset.name}
                onChange={(event) => updateData("assets", assets.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))}
              />
              <TextField
                label="Ext"
                value={asset.ext}
                onChange={(event) =>
                  updateData(
                    "assets",
                    assets.map((item, itemIndex) => (itemIndex === index ? { ...item, ext: event.target.value.toLowerCase().replace(/^\./, "") } : item))
                  )
                }
              />
              <TextField
                label="URI"
                value={asset.uri}
                onChange={(event) => updateData("assets", assets.map((item, itemIndex) => (itemIndex === index ? { ...item, uri: event.target.value } : item)))}
              />
              <Button icon={<Trash2 size={16} />} variant="danger" onClick={() => updateData("assets", assets.filter((_, itemIndex) => itemIndex !== index))}>
                Delete
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

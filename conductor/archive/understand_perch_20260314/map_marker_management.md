# Leaflet Map and Marker Management Summary

## Map Initialization
- **Framework**: Leaflet.js (`L`).
- **Base Layer**: CartoDB Positron (Muted, "Light" palette) for high contrast with colored pins.
- **Configuration**:
    - **Initial Center**: CTU Main Campus, Cebu City (`10.2936, 123.8809`).
    - **Campus Bounds**: Strictly enforced `maxBounds` to prevent roaming away from the target area.
    - **Zoom**: `minZoom: 16`, `maxZoom: 19`.
- **Customization**: Built-in zoom controls and attribution are disabled in favor of custom UI elements.

## Marker Management (`pins.js`)
Markers are the primary visual interface of Perch. The system uses a centralized Map-based registry (`_markers`) to track and update pin states.

### Spot Pins
- **Reactive Updates**: Pins are updated via `_upsertMarker` whenever spot data or status changes in the store.
- **Visual Encoding**:
    - **Green (#22c55e)**: Free/High confidence.
    - **Yellow (#eab308)**: Maybe/Medium confidence.
    - **Blue (#3b82f6)**: Claimed (Ripple animation).
    - **Red (#ef4444)**: Full (Dimmed opacity).
- **Iconography**:
    - **On-Campus**: Pointed teardrop SVG.
    - **Off-Campus**: Circular SVG.
    - Both icons feature an internal "clipboard" graphic.

### Group Pins
- **Layering**: Rendered in a separate `_groupMarkers` collection with a higher `zIndexOffset` (500) to ensure visibility over spot pins.
- **Enhanced UI**:
    - **Initials**: Displays the pinner's initials inside the teardrop.
    - **Joiner Badge**: Numeric indicator of members who have joined the beacon.
    - **Transit Dots**: Small orbiting dots representing members "heading" to the location.

### Interactive Elements
- **Tooltips**: Hovering/tapping a pin reveals a custom HTML card (`map-spot-popup`) showing spot name, confidence badge, capacity, and amenity icons (🔇, ⚡, 📶, 🍔).
- **Selection**: Selecting a spot scales the marker by 1.35x and brings it to the front (`zIndex: 999`).
- **Event Bus**: Map interactions (clicks) are decoupled from logic; the map only emits `MAP_PIN_CLICKED`, leaving the store/UI to handle the response.

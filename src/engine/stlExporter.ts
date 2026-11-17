import * as THREE from 'three';

/**
 * Exports a Three.js Group to a print-ready Binary STL file (Z-up, millimeters,
 * resting flush on the print bed Z = 0).
 */
export function exportGroupToBinarySTL(
  group: THREE.Group,
  targetHeightMm: number,
  filename: string
) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const center = new THREE.Vector3();
  bounds.getCenter(center);

  const scale = targetHeightMm / Math.max(0.0001, size.y);
  const minY = bounds.min.y;

  // Collect all triangles in world space
  let totalTriangles = 0;
  const meshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      meshes.push(obj);
      const geo = obj.geometry;
      totalTriangles += geo.index
        ? Math.floor(geo.index.count / 3)
        : Math.floor(geo.attributes.position.count / 3);
    }
  });

  const bufferLength = 84 + totalTriangles * 50;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);

  // 80-byte ASCII header
  const headerText = `Gopuram Studio Binary STL (${Math.round(targetHeightMm)}mm)`;
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < headerText.length ? headerText.charCodeAt(i) : 32);
  }
  view.setUint32(80, totalTriangles, true);

  let offset = 84;
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  // Convert Three.js Y-up (X, Y, Z) -> Slicer Z-up (X, -Z, Y) centered at XY=0, base at Z=0
  const toPrinterSpace = (v: THREE.Vector3) => {
    const px = (v.x - center.x) * scale;
    const py = -(v.z - center.z) * scale;
    const pz = (v.y - minY) * scale;
    v.set(px, py, pz);
  };

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const index = geo.index;
    const matrix = mesh.matrixWorld;

    const writeTri = (i0: number, i1: number, i2: number) => {
      vA.fromBufferAttribute(pos, i0).applyMatrix4(matrix);
      vB.fromBufferAttribute(pos, i1).applyMatrix4(matrix);
      vC.fromBufferAttribute(pos, i2).applyMatrix4(matrix);

      toPrinterSpace(vA);
      toPrinterSpace(vB);
      toPrinterSpace(vC);

      cb.subVectors(vC, vB);
      ab.subVectors(vA, vB);
      cb.cross(ab).normalize();

      // Normal
      view.setFloat32(offset, cb.x, true);
      view.setFloat32(offset + 4, cb.y, true);
      view.setFloat32(offset + 8, cb.z, true);

      // Vertex A
      view.setFloat32(offset + 12, vA.x, true);
      view.setFloat32(offset + 16, vA.y, true);
      view.setFloat32(offset + 20, vA.z, true);

      // Vertex B
      view.setFloat32(offset + 24, vB.x, true);
      view.setFloat32(offset + 28, vB.y, true);
      view.setFloat32(offset + 32, vB.z, true);

      // Vertex C
      view.setFloat32(offset + 36, vC.x, true);
      view.setFloat32(offset + 40, vC.y, true);
      view.setFloat32(offset + 44, vC.z, true);

      // Attribute byte count
      view.setUint16(offset + 48, 0, true);
      offset += 50;
    };

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        writeTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        writeTri(i, i + 1, i + 2);
      }
    }
  }

  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ComplexSpectrum {
  real: Float64Array;
  imaginary: Float64Array;
}

export function nextPowerOfTwo(value: number): number {
  if (!Number.isFinite(value) || value <= 1) {
    return 1;
  }
  return 2 ** Math.ceil(Math.log2(value));
}

function reverseBits(value: number, bitCount: number): number {
  let reversed = 0;
  for (let bit = 0; bit < bitCount; bit += 1) {
    reversed = (reversed << 1) | (value & 1);
    value >>= 1;
  }
  return reversed;
}

export function fftReal(input: Float64Array): ComplexSpectrum {
  const size = input.length;
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error("FFTサイズは2以上の2のべき乗である必要があります。");
  }

  const real = new Float64Array(input);
  const imaginary = new Float64Array(size);
  const bitCount = Math.log2(size);

  for (let index = 0; index < size; index += 1) {
    const reversed = reverseBits(index, bitCount);
    if (reversed > index) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
    }
  }

  for (let length = 2; length <= size; length *= 2) {
    const halfLength = length / 2;
    const phaseStep = (-2 * Math.PI) / length;

    for (let start = 0; start < size; start += length) {
      for (let offset = 0; offset < halfLength; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + halfLength;
        const phase = phaseStep * offset;
        const cosine = Math.cos(phase);
        const sine = Math.sin(phase);
        const oddReal =
          real[oddIndex] * cosine - imaginary[oddIndex] * sine;
        const oddImaginary =
          real[oddIndex] * sine + imaginary[oddIndex] * cosine;

        real[oddIndex] = real[evenIndex] - oddReal;
        imaginary[oddIndex] = imaginary[evenIndex] - oddImaginary;
        real[evenIndex] += oddReal;
        imaginary[evenIndex] += oddImaginary;
      }
    }
  }

  return { real, imaginary };
}

import Image from 'next/image';

interface LabelStudioIconProps {
  className?: string;
}

export const LabelStudioIcon = ({
  className = 'size-4',
}: LabelStudioIconProps) => (
  <Image
    src="/label-studio.svg"
    alt="Label Studio"
    className={className}
    width={16}
    height={16}
  />
);

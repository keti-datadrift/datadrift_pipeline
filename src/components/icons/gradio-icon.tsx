import Image from 'next/image';

interface GradioIconProps {
  className?: string;
}

export const GradioIcon = ({ className = 'size-4' }: GradioIconProps) => (
  <Image
    src="/gradio.svg"
    alt="Gradio"
    className={className}
    width={16}
    height={16}
  />
);

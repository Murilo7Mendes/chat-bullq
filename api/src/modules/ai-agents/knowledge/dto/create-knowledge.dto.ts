import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateKnowledgeDto {
  @ApiProperty({ example: 'Prazos Trabalhistas' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'O pagamento da folha deve ser feito até o 5º dia útil...' })
  @IsString()
  @MinLength(10)
  content: string;
}

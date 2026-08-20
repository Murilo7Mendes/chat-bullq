import { IsString, IsOptional, IsObject, IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class UpdateContactDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Transform(emptyToNull) name?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Transform(emptyToNull) phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @Transform(emptyToNull) email?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Transform(emptyToNull) notes?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, any>;
}
